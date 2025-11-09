import type { Database, TypedSupabaseClient } from '@route-kun/supabase';
import { createHash } from 'crypto';

export type SupabaseClient = TypedSupabaseClient;
type DistanceCacheRow = Database['public']['Tables']['distance_cache']['Row'];

/**
 * Distance request parameters for cache lookup
 */
export type DistanceRequest = {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  departureTime?: Date;
  options?: {
    trafficModel?: 'best_guess' | 'optimistic' | 'pessimistic';
    unitSystem?: 'metric' | 'imperial';
  };
};

/**
 * Distance response with cache metadata
 */
export type DistanceResponse = {
  distanceMeters: number;
  durationSeconds: number;
  freshness: 'fresh' | 'expired' | 'fetched';
  provider: string;
  requestedAt: string;
  expiresAt: string;
  source: 'cache' | 'api';
};

/**
 * Cache status for database records
 */
export type CacheStatus = 'fresh' | 'expired' | 'error';

/**
 * Distance cache interface
 */
export interface DistanceCache {
  /**
   * Get distance from cache or return null if not found
   */
  getDistance(request: DistanceRequest): Promise<DistanceResponse | null>;

  /**
   * Store distance in cache
   */
  putDistance(request: DistanceRequest, data: DistanceResponse): Promise<void>;
}

/**
 * Normalize coordinate to 6 decimal places (±0.11m precision)
 */
const normalizePoint = (lat: number, lng: number): string => {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
};

/**
 * Round departure time to 5-minute buckets
 */
const bucketDepartureTime = (ts: Date): Date => {
  const minutes = ts.getMinutes();
  const roundedMinutes = Math.floor(minutes / 5) * 5;
  const bucketed = new Date(ts);
  bucketed.setMinutes(roundedMinutes, 0, 0);
  return bucketed;
};

/**
 * Generate cache key from normalized request parameters
 */
export const makeDistanceCacheKey = (request: DistanceRequest): string => {
  const mode = request.mode ?? 'driving';
  const departureTime = request.departureTime ?? new Date();
  const bucketedTime = bucketDepartureTime(departureTime);
  const trafficModel = request.options?.trafficModel ?? 'best_guess';
  const unitSystem = request.options?.unitSystem ?? 'metric';

  const payload = [
    normalizePoint(request.origin.lat, request.origin.lng),
    normalizePoint(request.destination.lat, request.destination.lng),
    mode,
    bucketedTime.toISOString(),
    trafficModel,
    unitSystem
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
};

/**
 * Generate request fingerprint for API parameters
 */
export const makeRequestFingerprint = (request: DistanceRequest): string => {
  const options = {
    trafficModel: request.options?.trafficModel ?? 'best_guess',
    unitSystem: request.options?.unitSystem ?? 'metric'
  };

  return createHash('sha256').update(JSON.stringify(options)).digest('hex');
};

/**
 * Check if cache entry is expired
 */
const isExpired = (expiresAt: string): boolean => {
  return new Date(expiresAt) < new Date();
};

/**
 * Determine cache freshness status
 */
const determineFreshness = (
  status: CacheStatus,
  expiresAt: string
): 'fresh' | 'expired' => {
  if (status === 'error') {
    return 'expired';
  }

  return isExpired(expiresAt) ? 'expired' : 'fresh';
};

/**
 * Supabase implementation of DistanceCache
 */
export class SupabaseDistanceCache implements DistanceCache {
  constructor(private readonly client: SupabaseClient) {}

  async getDistance(request: DistanceRequest): Promise<DistanceResponse | null> {
    const key = makeDistanceCacheKey(request);

    const { data, error } = await this.client
      .from('distance_cache')
      .select('*')
      .eq('key', key)
      .single();

    if (error || !data) {
      return null;
    }

    const cacheRow = data as DistanceCacheRow;

    // Increment hit count asynchronously (fire and forget)
    this.incrementHitCount(key).catch(() => {
      // Silently ignore hit count update failures
    });

    const freshness = determineFreshness(cacheRow.status as CacheStatus, cacheRow.expires_at);

    return {
      distanceMeters: cacheRow.distance_m,
      durationSeconds: cacheRow.duration_s,
      freshness,
      provider: cacheRow.provider,
      requestedAt: cacheRow.requested_at,
      expiresAt: cacheRow.expires_at,
      source: 'cache'
    };
  }

  async putDistance(request: DistanceRequest, data: DistanceResponse): Promise<void> {
    const key = makeDistanceCacheKey(request);
    const fingerprint = makeRequestFingerprint(request);
    const mode = request.mode ?? 'driving';
    const departureTime = request.departureTime ?? new Date();
    const timeBucket = bucketDepartureTime(departureTime);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const record = {
      key,
      origin_lat: request.origin.lat,
      origin_lng: request.origin.lng,
      destination_lat: request.destination.lat,
      destination_lng: request.destination.lng,
      mode,
      time_bucket: timeBucket.toISOString(),
      distance_m: data.distanceMeters,
      duration_s: data.durationSeconds,
      provider: data.provider,
      status: 'fresh' as const,
      requested_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      request_fingerprint: fingerprint,
      metadata: {
        source: data.source,
        originalRequestedAt: data.requestedAt
      }
    };

    // Upsert: insert or update if key exists
    const { error } = await this.client
      .from('distance_cache')
      .upsert(record, { onConflict: 'key' });

    if (error) {
      console.error('[distance-cache] Failed to store cache entry:', error);
      throw new Error(`Failed to store distance cache: ${error.message}`);
    }
  }

  private async incrementHitCount(key: string): Promise<void> {
    // Use the stored procedure for atomic increment
    const { error } = await this.client.rpc('increment_distance_cache_hit', {
      cache_key: key
    });

    if (error) {
      console.warn('[distance-cache] Failed to increment hit count:', error);
    }
  }
}

/**
 * In-memory implementation of DistanceCache (for testing)
 */
export class InMemoryDistanceCache implements DistanceCache {
  private readonly store = new Map<string, {
    data: DistanceResponse;
    request: DistanceRequest;
  }>();

  async getDistance(request: DistanceRequest): Promise<DistanceResponse | null> {
    const key = makeDistanceCacheKey(request);
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    const freshness = isExpired(entry.data.expiresAt) ? 'expired' : 'fresh';

    return {
      ...entry.data,
      freshness,
      source: 'cache'
    };
  }

  async putDistance(request: DistanceRequest, data: DistanceResponse): Promise<void> {
    const key = makeDistanceCacheKey(request);
    this.store.set(key, { data, request });
  }

  /**
   * Test helper: clear all cache entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Test helper: get cache size
   */
  size(): number {
    return this.store.size;
  }
}

/**
 * Factory to create appropriate DistanceCache implementation
 */
export const createDistanceCache = (client?: SupabaseClient): DistanceCache => {
  if (client) {
    return new SupabaseDistanceCache(client);
  }

  return new InMemoryDistanceCache();
};

