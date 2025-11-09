import type { DistanceCache, DistanceRequest, DistanceResponse } from './distance-cache';
import type { GoogleDistanceClient } from './google-distance-client';

/**
 * Distance service metrics for tracking cache performance
 */
export type DistanceMetrics = {
  hits: number;
  misses: number;
};

/**
 * Distance service that combines cache and Google API
 */
export interface DistanceService {
  /**
   * Get distance, checking cache first, then falling back to API
   */
  getDistance(request: DistanceRequest): Promise<DistanceResponse>;

  /**
   * Get current metrics
   */
  getMetrics(): DistanceMetrics;

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void;
}

/**
 * Implementation of DistanceService with cache-first strategy
 */
export class CachedDistanceService implements DistanceService {
  private metrics: DistanceMetrics = { hits: 0, misses: 0 };

  constructor(
    private readonly cache: DistanceCache,
    private readonly client: GoogleDistanceClient
  ) {}

  async getDistance(request: DistanceRequest): Promise<DistanceResponse> {
    // Try cache first
    const cached = await this.cache.getDistance(request);

    if (cached) {
      this.metrics.hits++;
      return cached;
    }

    // Cache miss: fetch from API
    this.metrics.misses++;
    const response = await this.client.fetchDistance(request);

    // Store in cache (fire and forget to avoid blocking)
    this.cache.putDistance(request, response).catch((error) => {
      console.error('[distance-service] Failed to store in cache:', error);
    });

    return response;
  }

  getMetrics(): DistanceMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = { hits: 0, misses: 0 };
  }
}

/**
 * Factory to create DistanceService
 */
export const createDistanceService = (
  cache: DistanceCache,
  client: GoogleDistanceClient
): DistanceService => {
  return new CachedDistanceService(cache, client);
};

