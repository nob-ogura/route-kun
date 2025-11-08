import { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from './types/database.types';

type RouteRow = Database['public']['Tables']['routes']['Row'];
type RouteStopRow = Database['public']['Tables']['route_stops']['Row'];
type RouteInsert = Database['public']['Tables']['routes']['Insert'];
type RouteStopInsert = Database['public']['Tables']['route_stops']['Insert'];

export type RouteAlgorithm = 'optimizer' | 'nearest_neighbor';

type SupabaseDbClient = SupabaseClient<Database>;

export interface RouteEndpoint {
  id: string;
  label?: string | null;
  lat: number;
  lng: number;
}

export interface RouteStopPersistenceInput extends RouteEndpoint {
  sequence: number;
  distanceFromPreviousM: number;
  durationFromPreviousS: number;
  cumulativeDistanceM: number;
  cumulativeDurationS: number;
  rawInput?: Json;
}

export interface RouteDiagnosticsRecord {
  optimizer: Json | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  fallbackStrategy: string | null;
  optimizerErrorCode?: string | null;
  [key: string]: Json | undefined;
}

export interface SaveRouteResultPayload {
  userId: string;
  routeId: string;
  algorithm: RouteAlgorithm;
  origin: RouteEndpoint;
  orderedStops: RouteStopPersistenceInput[];
  totalDistanceM: number;
  totalDurationS: number;
  paramsDigest: string;
  paramsSnapshot: Json;
  diagnostics: RouteDiagnosticsRecord;
  distanceCacheMetrics?: {
    hits?: number;
    misses?: number;
  };
}

export interface RouteSummary {
  routeId: string;
  createdAt: string;
  algorithm: RouteAlgorithm;
  destinationCount: number;
  totalDistanceM: number;
  totalDurationS: number;
  paramsDigest: string;
  diagnostics: RouteDiagnosticsRecord;
}

export interface ListRoutesParams {
  userId: string;
  limit?: number;
  cursor?: string | null;
}

export interface ListRoutesResult {
  routes: RouteSummary[];
  nextCursor: string | null;
}

export interface RouteStopRecord extends RouteStopPersistenceInput {
  routeStopId: string;
  rawInput: Json;
  createdAt: string;
}

export interface RouteDetail extends RouteSummary {
  origin: RouteEndpoint;
  paramsSnapshot: Json;
  distanceCacheHitCount: number;
  distanceCacheMissCount: number;
  stops: RouteStopRecord[];
}

const clampLimit = (limit?: number): number => {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.trunc(limit)));
};

const ensureStops = (stops: RouteStopPersistenceInput[]) => {
  if (stops.length === 0) {
    throw new Error('orderedStops must contain at least the origin entry');
  }
};

const buildRouteRow = (payload: SaveRouteResultPayload): RouteInsert => {
  ensureStops(payload.orderedStops);

  const destinationCount = Math.max(payload.orderedStops.length - 1, 0);
  const hits = payload.distanceCacheMetrics?.hits ?? 0;
  const misses = payload.distanceCacheMetrics?.misses ?? 0;

  return {
    id: payload.routeId,
    user_id: payload.userId,
    origin_id: payload.origin.id,
    origin_label: payload.origin.label ?? null,
    origin_lat: payload.origin.lat,
    origin_lng: payload.origin.lng,
    destination_count: destinationCount,
    total_distance_m: payload.totalDistanceM,
    total_duration_s: payload.totalDurationS,
    algorithm: payload.algorithm,
    params_digest: payload.paramsDigest,
    params_snapshot: payload.paramsSnapshot,
    diagnostics: payload.diagnostics as Json,
    distance_cache_hit_count: hits,
    distance_cache_miss_count: misses
  };
};

const buildRouteStopsRows = (
  payload: SaveRouteResultPayload
): RouteStopInsert[] => {
  ensureStops(payload.orderedStops);

  return payload.orderedStops.map((stop) => ({
    route_id: payload.routeId,
    user_id: payload.userId,
    stop_id: stop.id,
    label: stop.label ?? null,
    lat: stop.lat,
    lng: stop.lng,
    sequence: stop.sequence,
    distance_from_previous_m: stop.distanceFromPreviousM,
    duration_from_previous_s: stop.durationFromPreviousS,
    cumulative_distance_m: stop.cumulativeDistanceM,
    cumulative_duration_s: stop.cumulativeDurationS,
    raw_input: stop.rawInput ?? {
      id: stop.id,
      label: stop.label ?? null,
      lat: stop.lat,
      lng: stop.lng
    }
  }));
};

export const saveRouteResult = async (
  client: SupabaseDbClient,
  payload: SaveRouteResultPayload
): Promise<void> => {
  const routeRow = buildRouteRow(payload);
  const { error: routeError } = await client.from('routes').insert(routeRow);
  if (routeError) {
    throw new Error(`Failed to persist route ${payload.routeId}: ${routeError.message}`);
  }

  const stopRows = buildRouteStopsRows(payload);
  const { error: stopError } = await client.from('route_stops').insert(stopRows);
  if (stopError) {
    throw new Error(`Failed to persist route stops for ${payload.routeId}: ${stopError.message}`);
  }

  console.info(
    `[routes] user=${payload.userId} route=${payload.routeId} saved destinations=${routeRow.destination_count} cacheHits=${routeRow.distance_cache_hit_count} cacheMisses=${routeRow.distance_cache_miss_count}`
  );
};

const mapDiagnostics = (value: Json): RouteDiagnosticsRecord => {
  const record = (value ?? {}) as Partial<RouteDiagnosticsRecord>;
  return {
    optimizer: (record.optimizer ?? null) as Json | null,
    fallbackUsed: Boolean(record.fallbackUsed),
    fallbackReason: (record.fallbackReason ?? null) as string | null,
    fallbackStrategy: (record.fallbackStrategy ?? null) as string | null,
    optimizerErrorCode: (record.optimizerErrorCode ?? null) as string | null
  };
};

type RouteListRow = Pick<
  RouteRow,
  | 'id'
  | 'created_at'
  | 'algorithm'
  | 'destination_count'
  | 'total_distance_m'
  | 'total_duration_s'
  | 'params_digest'
  | 'diagnostics'
>;

export const listRoutes = async (
  client: SupabaseDbClient,
  params: ListRoutesParams
): Promise<ListRoutesResult> => {
  const limit = clampLimit(params.limit);
  let query = client
    .from('routes')
    .select(
      `id, created_at, algorithm, destination_count, total_distance_m, total_duration_s, params_digest, diagnostics`
    )
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (params.cursor) {
    query = query.lt('created_at', params.cursor);
  }

  const { data, error } = await query.returns<RouteListRow[]>();
  if (error) {
    throw new Error(`Failed to list routes: ${error.message}`);
  }

  const hasNext = (data?.length ?? 0) > limit;
  const rows = hasNext ? data!.slice(0, limit) : data ?? [];

  return {
    routes: rows.map((row) => ({
      routeId: row.id,
      createdAt: row.created_at,
      algorithm: row.algorithm as RouteAlgorithm,
      destinationCount: row.destination_count,
      totalDistanceM: row.total_distance_m,
      totalDurationS: row.total_duration_s,
      paramsDigest: row.params_digest,
      diagnostics: mapDiagnostics(row.diagnostics)
    })),
    nextCursor: hasNext ? rows[rows.length - 1]?.created_at ?? null : null
  };
};

export const getRoute = async (
  client: SupabaseDbClient,
  userId: string,
  routeId: string
): Promise<RouteDetail | null> => {
  const {
    data: route,
    error: routeError
  } = await client
    .from('routes')
    .select('*')
    .eq('user_id', userId)
    .eq('id', routeId)
    .returns<RouteRow[]>()
    .maybeSingle<RouteRow>();

  if (routeError) {
    throw new Error(`Failed to fetch route ${routeId}: ${routeError.message}`);
  }

  if (!route) {
    return null;
  }

  const {
    data: stops,
    error: stopsError
  } = await client
    .from('route_stops')
    .select('*')
    .eq('user_id', userId)
    .eq('route_id', routeId)
    .order('sequence', { ascending: true })
    .returns<RouteStopRow[]>();

  if (stopsError) {
    throw new Error(`Failed to fetch route stops for ${routeId}: ${stopsError.message}`);
  }

  return {
    routeId: route.id,
    createdAt: route.created_at,
    algorithm: route.algorithm as RouteAlgorithm,
    destinationCount: route.destination_count,
    totalDistanceM: route.total_distance_m,
    totalDurationS: route.total_duration_s,
    paramsDigest: route.params_digest,
    diagnostics: mapDiagnostics(route.diagnostics),
    origin: {
      id: route.origin_id,
      label: route.origin_label,
      lat: route.origin_lat,
      lng: route.origin_lng
    },
    paramsSnapshot: route.params_snapshot,
    distanceCacheHitCount: route.distance_cache_hit_count,
    distanceCacheMissCount: route.distance_cache_miss_count,
    stops: (stops ?? []).map((stop) => ({
      routeStopId: stop.id,
      id: stop.stop_id,
      label: stop.label,
      lat: stop.lat,
      lng: stop.lng,
      sequence: stop.sequence,
      distanceFromPreviousM: stop.distance_from_previous_m,
      durationFromPreviousS: stop.duration_from_previous_s,
      cumulativeDistanceM: stop.cumulative_distance_m,
      cumulativeDurationS: stop.cumulative_duration_s,
      rawInput: stop.raw_input,
      createdAt: stop.created_at
    }))
  };
};
