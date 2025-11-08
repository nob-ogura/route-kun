import { loadEnv } from '@route-kun/config';
import {
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
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

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

type RouteOptimizeInput = z.infer<typeof RouteOptimizeInputSchema>;
export type RouteOptimizeResult = z.infer<typeof RouteOptimizeResultSchema>;

type FallbackReason = z.infer<typeof FallbackReasonSchema>;

type RouteOptimizationDependencies = {
  optimizerClient: OptimizerClient;
  fallbackPlanner: typeof computeNearestNeighborPlan;
  routeIdGenerator: () => string;
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
    }
  };
};

const toDestination = (stop: RouteStop) => ({
  id: stop.id,
  label: stop.label,
  lat: stop.lat,
  lng: stop.lng
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
  input: RouteOptimizeInput
): Promise<RouteOptimizeResult> => {
  const optimizerOptions = OptimizerOptionsSchema.parse(input.options ?? {});

  try {
    const response = await deps.optimizerClient.optimize({
      origin: { lat: input.origin.lat, lng: input.origin.lng },
      destinations: input.destinations.map(toDestination),
      options: optimizerOptions
    });

    if (needsFallback(response, optimizerOptions)) {
      const plan = buildFallbackPlan(deps, input.origin, input.destinations);
      return buildResult(plan, {
        optimizer: response.diagnostics,
        fallbackUsed: true,
        fallbackReason: response.diagnostics.fallbackUsed
          ? 'optimizer_fallback_signaled'
          : 'optimizer_gap_exceeded'
      });
    }

    const plan = buildPlanFromOptimizer(response);
    return buildResult(plan, {
      optimizer: response.diagnostics,
      fallbackUsed: false,
      fallbackReason: null
    });
  } catch (error) {
    const plan = buildFallbackPlan(deps, input.origin, input.destinations);
    const optimizerError = isOptimizerError(error) ? error : null;

    return buildResult(plan, {
      optimizer: null,
      fallbackUsed: true,
      fallbackReason: 'optimizer_error',
      optimizerErrorCode: optimizerError?.code ?? null
    });
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
      optimize: t.procedure.input(RouteOptimizeInputSchema).mutation(async ({ input }) => {
        return handleRouteOptimization(deps, input);
      })
    })
  });
};

export const appRouter = createAppRouter();
export type AppRouter = typeof appRouter;
