import { loadEnv } from '@route-kun/config';
import {
  computeRouteParamsDigest,
  createRouteGeoJson,
  computeNearestNeighborPlan,
  RoutePlan as DomainRoutePlan,
  RouteStop,
  RouteStopSchema
} from '@route-kun/domain';
import {
  createOptimizerClient,
  Diagnostics,
  DiagnosticsSchema,
  OptimizerClient,
  OptimizerClientError,
  OptimizerClientErrorCode,
  OptimizerOptions,
  OptimizerOptionsSchema,
  OptimizerResponse,
  OrderedStopSchema
} from '@route-kun/optimizer-client';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

import { createSupabaseClient, Json, RouteAlgorithm } from '@route-kun/supabase';

import {
  createInMemoryRouteRepository,
  createSupabaseRouteRepository,
  type RouteRepository,
  type RouteRepositorySavePayload,
  type RouteRepositoryListResult,
  type RouteRepositoryDetail
} from './route-repository';

type AppRouterContext = {
  userId: string;
};

const t = initTRPC.context<AppRouterContext>().create();

const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'User context is required' });
  }

  return next({ ctx });
});

type RoutePlanWithId = DomainRoutePlan & { routeId: string };

type RouteGeoJsonPoint = {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    label?: string;
    sequence: number;
    cumulativeDistanceM: number;
    cumulativeDurationS: number;
  };
};

type RouteGeoJsonLine = {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  properties: {
    totalDistanceM: number;
    totalDurationS: number;
  };
};

export type RouteGeoJson = {
  type: 'FeatureCollection';
  features: (RouteGeoJsonPoint | RouteGeoJsonLine)[];
};

const FeatureCollectionSchema: z.ZodType<RouteGeoJson> = z.object({
  type: z.literal('FeatureCollection'),
  features: z
    .array(
      z.union([
        z.object({
          type: z.literal('Feature'),
          geometry: z.object({
            type: z.literal('Point'),
            coordinates: z.tuple([z.number(), z.number()])
          }),
          properties: z.object({
            id: z.string().min(1),
            label: z.string().optional(),
            sequence: z.number().int().nonnegative(),
            cumulativeDistanceM: z.number().int().nonnegative(),
            cumulativeDurationS: z.number().int().nonnegative()
          })
        }),
        z.object({
          type: z.literal('Feature'),
          geometry: z.object({
            type: z.literal('LineString'),
            coordinates: z.array(z.tuple([z.number(), z.number()])).min(2)
          }),
          properties: z.object({
            totalDistanceM: z.number().int().nonnegative(),
            totalDurationS: z.number().int().nonnegative()
          })
        })
      ])
    )
    .min(1)
});

const RouteOptimizeInputSchema = z.object({
  origin: RouteStopSchema,
  destinations: z.array(RouteStopSchema).min(1).max(30),
  options: OptimizerOptionsSchema.partial().optional()
});

const RoutePlanSchema = z.object({
  routeId: z.string().uuid(),
  visitOrder: z.array(z.string().min(1)).min(1),
  orderedStops: z.array(OrderedStopSchema).min(1),
  totalDistanceM: z.number().int().nonnegative(),
  totalDurationS: z.number().int().nonnegative()
});

const RouteAlgorithmSchema = z.enum(['optimizer', 'nearest_neighbor']);

const FallbackReasonSchema = z.enum([
  'optimizer_gap_exceeded',
  'optimizer_fallback_signaled',
  'optimizer_error'
]);

const RouteDiagnosticsSchema = z.object({
  optimizer: DiagnosticsSchema.nullable(),
  fallbackUsed: z.boolean(),
  fallbackReason: FallbackReasonSchema.nullable(),
  fallbackStrategy: z.literal('nearest_neighbor').nullable(),
  optimizerErrorCode: z
    .union([
      z.literal('TIMEOUT'),
      z.literal('HTTP_4XX'),
      z.literal('HTTP_5XX'),
      z.literal('NETWORK'),
      z.literal('DECODE')
    ])
    .nullable()
    .optional()
});

const RouteOptimizeResultSchema = z.object({
  plan: RoutePlanSchema,
  geoJson: FeatureCollectionSchema,
  diagnostics: RouteDiagnosticsSchema
});

const RouteSummarySchema = z.object({
  routeId: z.string().uuid(),
  createdAt: z.string().datetime(),
  algorithm: RouteAlgorithmSchema,
  destinationCount: z.number().int().nonnegative(),
  totalDistanceM: z.number().int().nonnegative(),
  totalDurationS: z.number().int().nonnegative(),
  paramsDigest: z.string().min(1),
  diagnostics: RouteDiagnosticsSchema
});

const RouteStopRecordSchema = OrderedStopSchema.extend({
  routeStopId: z.string().min(1),
  rawInput: z.any(),
  createdAt: z.string().datetime()
});

const RouteDetailSchema = RouteSummarySchema.extend({
  origin: RouteStopSchema,
  paramsSnapshot: z.any(),
  distanceCacheHitCount: z.number().int().nonnegative(),
  distanceCacheMissCount: z.number().int().nonnegative(),
  stops: z.array(RouteStopRecordSchema)
});

const RouteListInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().datetime().optional()
});

const RouteListResultSchema = z.object({
  routes: z.array(RouteSummarySchema),
  nextCursor: z.string().datetime().nullable()
});

const RouteGetInputSchema = z.object({
  routeId: z.string().uuid()
});

type RouteOptimizeInput = z.infer<typeof RouteOptimizeInputSchema>;
export type RouteOptimizeResult = z.infer<typeof RouteOptimizeResultSchema>;

type FallbackReason = z.infer<typeof FallbackReasonSchema>;

type RouteOptimizationDependencies = {
  optimizerClient: OptimizerClient;
  fallbackPlanner: typeof computeNearestNeighborPlan;
  routeIdGenerator: () => string;
  routeRepository: RouteRepository;
};

const createRouteRepository = (env: ReturnType<typeof loadEnv>): RouteRepository => {
  const logWarnings = env.NODE_ENV !== 'test';

  if (env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)) {
    try {
      const client = createSupabaseClient({
        url: env.SUPABASE_URL,
        key: env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_ANON_KEY
      });
      return createSupabaseRouteRepository(client);
    } catch (error) {
      if (logWarnings) {
        console.warn('[route.repository] Falling back to in-memory repository', error);
      }
    }
  } else if (logWarnings) {
    console.warn('[route.repository] Supabase credentials missing; using in-memory repository');
  }

  return createInMemoryRouteRepository();
};

const createDefaultDependencies = (): RouteOptimizationDependencies => {
  const env = loadEnv();

  return {
    optimizerClient: createOptimizerClient({
      baseUrl: env.OPTIMIZER_SERVICE_URL
    }),
    fallbackPlanner: computeNearestNeighborPlan,
    routeIdGenerator: () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return `route_${Math.random().toString(36).slice(2)}`;
    },
    routeRepository: createRouteRepository(env)
  };
};

const toDestination = (stop: RouteStop) => ({
  id: stop.id,
  label: stop.label,
  lat: stop.lat,
  lng: stop.lng
});

const snapshotStop = (stop: RouteStop) => ({
  id: stop.id,
  label: stop.label ?? null,
  lat: stop.lat,
  lng: stop.lng
});

const buildStopLookup = (origin: RouteStop, destinations: RouteStop[]) => {
  const lookup = new Map<string, RouteStop>();
  lookup.set(origin.id, origin);
  destinations.forEach((stop) => lookup.set(stop.id, stop));
  return lookup;
};

const buildPersistenceStops = (
  orderedStops: RoutePlanWithId['orderedStops'],
  lookup: Map<string, RouteStop>
): RouteRepositorySavePayload['orderedStops'] =>
  orderedStops.map((stop) => ({
    id: stop.id,
    label: stop.label ?? null,
    lat: stop.lat,
    lng: stop.lng,
    sequence: stop.sequence,
    distanceFromPreviousM: stop.distanceFromPreviousM,
    durationFromPreviousS: stop.durationFromPreviousS,
    cumulativeDistanceM: stop.cumulativeDistanceM,
    cumulativeDurationS: stop.cumulativeDurationS,
    rawInput:
      lookup.get(stop.id) !== undefined
        ? snapshotStop(lookup.get(stop.id)!)
        : {
            id: stop.id,
            label: stop.label ?? null,
            lat: stop.lat,
            lng: stop.lng
          }
  }));

const buildParamsSnapshot = (
  input: RouteOptimizeInput,
  optimizerOptions: OptimizerOptions
): Json => ({
  origin: snapshotStop(input.origin),
  destinations: input.destinations.map((stop) => snapshotStop(stop)),
  options: optimizerOptions
});

const buildSavePayload = (options: {
  userId: string;
  input: RouteOptimizeInput;
  plan: RoutePlanWithId;
  optimizerOptions: OptimizerOptions;
  diagnostics: RouteOptimizeResult['diagnostics'];
  paramsDigest: string;
  paramsSnapshot: Json;
  stopLookup: Map<string, RouteStop>;
  algorithm: RouteAlgorithm;
}): RouteRepositorySavePayload => ({
  userId: options.userId,
  routeId: options.plan.routeId,
  algorithm: options.algorithm,
  origin: snapshotStop(options.input.origin),
  orderedStops: buildPersistenceStops(options.plan.orderedStops, options.stopLookup),
  totalDistanceM: options.plan.totalDistanceM,
  totalDurationS: options.plan.totalDurationS,
  paramsDigest: options.paramsDigest,
  paramsSnapshot: options.paramsSnapshot,
  diagnostics: options.diagnostics,
  distanceCacheMetrics: {
    hits: 0,
    misses: 0
  }
});

type RouteHistorySummary = RouteRepositoryListResult['routes'][number];
type RouteHistoryDetail = RouteRepositoryDetail;

const normalizeLabel = (label?: string | null) => label ?? undefined;

const mapRouteSummary = (record: RouteHistorySummary) =>
  RouteSummarySchema.parse({
    routeId: record.routeId,
    createdAt: record.createdAt,
    algorithm: record.algorithm,
    destinationCount: record.destinationCount,
    totalDistanceM: record.totalDistanceM,
    totalDurationS: record.totalDurationS,
    paramsDigest: record.paramsDigest,
    diagnostics: record.diagnostics
  });

const mapRouteDetail = (record: RouteHistoryDetail) =>
  RouteDetailSchema.parse({
    routeId: record.routeId,
    createdAt: record.createdAt,
    algorithm: record.algorithm,
    destinationCount: record.destinationCount,
    totalDistanceM: record.totalDistanceM,
    totalDurationS: record.totalDurationS,
    paramsDigest: record.paramsDigest,
    diagnostics: record.diagnostics,
    origin: {
      id: record.origin.id,
      label: normalizeLabel(record.origin.label),
      lat: record.origin.lat,
      lng: record.origin.lng
    },
    paramsSnapshot: record.paramsSnapshot,
    distanceCacheHitCount: record.distanceCacheHitCount,
    distanceCacheMissCount: record.distanceCacheMissCount,
    stops: record.stops.map((stop) => ({
      routeStopId: stop.routeStopId,
      id: stop.id,
      label: normalizeLabel(stop.label),
      lat: stop.lat,
      lng: stop.lng,
      sequence: stop.sequence,
      distanceFromPreviousM: stop.distanceFromPreviousM,
      durationFromPreviousS: stop.durationFromPreviousS,
      cumulativeDistanceM: stop.cumulativeDistanceM,
      cumulativeDurationS: stop.cumulativeDurationS,
      rawInput: stop.rawInput,
      createdAt: stop.createdAt
    }))
  });

const needsFallback = (response: OptimizerResponse, options: OptimizerOptions): boolean => {
  if (response.diagnostics.fallbackUsed) {
    return true;
  }

  return response.diagnostics.gap > options.fallbackTolerance;
};

const buildPlanFromOptimizer = (response: OptimizerResponse): RoutePlanWithId => ({
  routeId: response.routeId,
  visitOrder: response.visitOrder,
  orderedStops: response.orderedStops,
  totalDistanceM: response.totalDistanceM,
  totalDurationS: response.totalDurationS
});

const buildFallbackPlan = (
  deps: RouteOptimizationDependencies,
  origin: RouteStop,
  destinations: RouteStop[]
): RoutePlanWithId => {
  const plan = deps.fallbackPlanner(origin, destinations);

  return {
    routeId: deps.routeIdGenerator(),
    visitOrder: plan.visitOrder,
    orderedStops: plan.orderedStops,
    totalDistanceM: plan.totalDistanceM,
    totalDurationS: plan.totalDurationS
  };
};

const extractGeoJson = (plan: RoutePlanWithId): RouteGeoJson => {
  const { routeId: _routeId, ...rest } = plan;
  return createRouteGeoJson(rest);
};

const isOptimizerError = (error: unknown): error is OptimizerClientError =>
  error instanceof OptimizerClientError;

const buildResult = (
  plan: RoutePlanWithId,
  diagnostics: {
    optimizer: Diagnostics | null;
    fallbackUsed: boolean;
    fallbackReason: FallbackReason | null;
    optimizerErrorCode?: OptimizerClientErrorCode | null;
  }
): RouteOptimizeResult => {
  const payload = {
    plan,
    geoJson: extractGeoJson(plan),
    diagnostics: {
      optimizer: diagnostics.optimizer,
      fallbackUsed: diagnostics.fallbackUsed,
      fallbackReason: diagnostics.fallbackReason,
      fallbackStrategy: diagnostics.fallbackUsed ? 'nearest_neighbor' : null,
      optimizerErrorCode: diagnostics.optimizerErrorCode ?? null
    }
  };

  return RouteOptimizeResultSchema.parse(payload);
};

const handleRouteOptimization = async (
  deps: RouteOptimizationDependencies,
  ctx: AppRouterContext,
  input: RouteOptimizeInput
): Promise<RouteOptimizeResult> => {
  const optimizerOptions = OptimizerOptionsSchema.parse(input.options ?? {});
  const paramsDigest = computeRouteParamsDigest({
    origin: input.origin,
    destinations: input.destinations,
    options: optimizerOptions
  });
  const paramsSnapshot = buildParamsSnapshot(input, optimizerOptions);
  const stopLookup = buildStopLookup(input.origin, input.destinations);

  const persistPlan = async (
    plan: RoutePlanWithId,
    diagnostics: RouteOptimizeResult['diagnostics'],
    algorithm: RouteAlgorithm
  ) => {
    const payload = buildSavePayload({
      userId: ctx.userId,
      input,
      plan,
      optimizerOptions,
      diagnostics,
      paramsDigest,
      paramsSnapshot,
      stopLookup,
      algorithm
    });
    await deps.routeRepository.saveRouteResult(payload);
  };

  try {
    const response = await deps.optimizerClient.optimize({
      origin: { lat: input.origin.lat, lng: input.origin.lng },
      destinations: input.destinations.map(toDestination),
      options: optimizerOptions
    });

    if (needsFallback(response, optimizerOptions)) {
      const plan = buildFallbackPlan(deps, input.origin, input.destinations);
      const result = buildResult(plan, {
        optimizer: response.diagnostics,
        fallbackUsed: true,
        fallbackReason: response.diagnostics.fallbackUsed
          ? 'optimizer_fallback_signaled'
          : 'optimizer_gap_exceeded'
      });
      await persistPlan(plan, result.diagnostics, 'nearest_neighbor');
      return result;
    }

    const plan = buildPlanFromOptimizer(response);
    const result = buildResult(plan, {
      optimizer: response.diagnostics,
      fallbackUsed: false,
      fallbackReason: null
    });
    await persistPlan(plan, result.diagnostics, 'optimizer');
    return result;
  } catch (error) {
    const plan = buildFallbackPlan(deps, input.origin, input.destinations);
    const optimizerError = isOptimizerError(error) ? error : null;

    const result = buildResult(plan, {
      optimizer: null,
      fallbackUsed: true,
      fallbackReason: 'optimizer_error',
      optimizerErrorCode: optimizerError?.code ?? null
    });
    await persistPlan(plan, result.diagnostics, 'nearest_neighbor');
    return result;
  }
};

export const createAppRouter = (
  overrides?: Partial<RouteOptimizationDependencies>
) => {
  const deps = { ...createDefaultDependencies(), ...overrides };

  return t.router({
    ping: t.procedure.query(() => 'pong'),
    echo: t.procedure.input(z.string()).mutation(({ input }) => input),
    route: t.router({
      optimize: authedProcedure.input(RouteOptimizeInputSchema).mutation(async ({ ctx, input }) => {
        return handleRouteOptimization(deps, ctx, input);
      }),
      list: authedProcedure.input(RouteListInputSchema).query(async ({ ctx, input }) => {
        const raw = await deps.routeRepository.listRoutes({
          userId: ctx.userId,
          limit: input.limit,
          cursor: input.cursor ?? null
        });

        return RouteListResultSchema.parse({
          routes: raw.routes.map(mapRouteSummary),
          nextCursor: raw.nextCursor
        });
      }),
      get: authedProcedure.input(RouteGetInputSchema).query(async ({ ctx, input }) => {
        const detail = await deps.routeRepository.getRoute(ctx.userId, input.routeId);
        if (!detail) {
          return null;
        }

        return mapRouteDetail(detail);
      })
    })
  });
};

export const appRouter = createAppRouter();
export type AppRouter = typeof appRouter;
