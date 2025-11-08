import {
  getRoute as supabaseGetRoute,
  listRoutes as supabaseListRoutes,
  saveRouteResult as supabaseSaveRouteResult,
  type ListRoutesParams,
  type ListRoutesResult,
  type RouteDetail,
  type RouteStopRecord,
  type SaveRouteResultPayload
} from '@route-kun/supabase';

export type RouteRepositorySavePayload = SaveRouteResultPayload;
export type RouteRepositoryListParams = ListRoutesParams;
export type RouteRepositoryListResult = ListRoutesResult;
export type RouteRepositoryDetail = RouteDetail;

export interface RouteRepository {
  saveRouteResult(payload: RouteRepositorySavePayload): Promise<void>;
  listRoutes(params: RouteRepositoryListParams): Promise<RouteRepositoryListResult>;
  getRoute(userId: string, routeId: string): Promise<RouteRepositoryDetail | null>;
}

export const createSupabaseRouteRepository = (client: Parameters<typeof supabaseSaveRouteResult>[0]): RouteRepository => ({
  saveRouteResult: (payload) => supabaseSaveRouteResult(client, payload),
  listRoutes: (params) => supabaseListRoutes(client, params),
  getRoute: (userId, routeId) => supabaseGetRoute(client, userId, routeId)
});

const clampLimit = (limit?: number): number => {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return 20;
  }
  return Math.max(1, Math.min(50, Math.trunc(limit)));
};

const deepClone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const generateRouteStopId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `route_stop_${Math.random().toString(36).slice(2, 10)}`;
};

export const createInMemoryRouteRepository = (): RouteRepository => {
  const store = new Map<string, Map<string, RouteRepositoryDetail>>();

  return {
    async saveRouteResult(payload) {
      const now = new Date().toISOString();
      const destinationCount = Math.max(payload.orderedStops.length - 1, 0);
      const hits = payload.distanceCacheMetrics?.hits ?? 0;
      const misses = payload.distanceCacheMetrics?.misses ?? 0;

      const detail: RouteRepositoryDetail = {
        routeId: payload.routeId,
        createdAt: now,
        algorithm: payload.algorithm,
        destinationCount,
        totalDistanceM: payload.totalDistanceM,
        totalDurationS: payload.totalDurationS,
        paramsDigest: payload.paramsDigest,
        diagnostics: payload.diagnostics,
        origin: payload.origin,
        paramsSnapshot: payload.paramsSnapshot,
        distanceCacheHitCount: hits,
        distanceCacheMissCount: misses,
        stops: payload.orderedStops.map<RouteStopRecord>((stop) => ({
          routeStopId: generateRouteStopId(),
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
            stop.rawInput ?? {
              id: stop.id,
              label: stop.label ?? null,
              lat: stop.lat,
              lng: stop.lng
            },
          createdAt: now
        }))
      };

      const perUser = store.get(payload.userId) ?? new Map<string, RouteRepositoryDetail>();
      perUser.set(payload.routeId, detail);
      store.set(payload.userId, perUser);
    },

    async listRoutes(params) {
      const limit = clampLimit(params.limit);
      const perUser = store.get(params.userId);
      if (!perUser) {
        return { routes: [], nextCursor: null };
      }

      const ordered = Array.from(perUser.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

      const cursor = typeof params.cursor === 'string' ? params.cursor : null;
      const filtered =
        cursor !== null ? ordered.filter((route) => route.createdAt < cursor) : ordered;

      const page = filtered.slice(0, limit);
      const nextCursor = filtered.length > limit ? page[page.length - 1]?.createdAt ?? null : null;

      return {
        routes: page.map((route) => ({
          routeId: route.routeId,
          createdAt: route.createdAt,
          algorithm: route.algorithm,
          destinationCount: route.destinationCount,
          totalDistanceM: route.totalDistanceM,
          totalDurationS: route.totalDurationS,
          paramsDigest: route.paramsDigest,
          diagnostics: deepClone(route.diagnostics)
        })),
        nextCursor
      } satisfies RouteRepositoryListResult;
    },

    async getRoute(userId, routeId) {
      const perUser = store.get(userId);
      if (!perUser) {
        return null;
      }

      const detail = perUser.get(routeId);
      if (!detail) {
        return null;
      }

      return deepClone(detail);
    }
  };
};
