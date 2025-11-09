import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDistanceCache, type DistanceRequest, type DistanceResponse } from './distance-cache';
import { MockGoogleDistanceClient } from './google-distance-client';
import { CachedDistanceService } from './distance-service';

describe('CachedDistanceService', () => {
  let cache: InMemoryDistanceCache;
  let client: MockGoogleDistanceClient;
  let service: CachedDistanceService;

  beforeEach(() => {
    cache = new InMemoryDistanceCache();
    client = new MockGoogleDistanceClient(5000, 600);
    service = new CachedDistanceService(cache, client);
  });

  const createRequest = (): DistanceRequest => ({
    origin: { lat: 35.681236, lng: 139.767125 },
    destination: { lat: 35.658581, lng: 139.745438 },
    mode: 'driving',
    departureTime: new Date('2024-11-09T10:30:00Z')
  });

  it('should fetch from API on cache miss', async () => {
    const request = createRequest();

    const response = await service.getDistance(request);

    expect(response).toMatchObject({
      distanceMeters: 5000,
      durationSeconds: 600,
      source: 'api'
    });

    const metrics = service.getMetrics();
    expect(metrics).toEqual({ hits: 0, misses: 1 });
  });

  it('should return cached result on cache hit', async () => {
    const request = createRequest();

    // First call: cache miss, fetch from API
    const response1 = await service.getDistance(request);
    expect(response1.source).toBe('api');

    // Wait a bit for async cache write to complete
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second call: cache hit
    const response2 = await service.getDistance(request);
    expect(response2.source).toBe('cache');

    const metrics = service.getMetrics();
    expect(metrics).toEqual({ hits: 1, misses: 1 });
  });

  it('should track multiple hits and misses', async () => {
    const request1 = createRequest();
    const request2 = { ...createRequest(), mode: 'walking' as const };

    // First request: miss
    await service.getDistance(request1);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second request (different key): miss
    await service.getDistance(request2);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Repeat first request: hit
    await service.getDistance(request1);

    // Repeat second request: hit
    await service.getDistance(request2);

    const metrics = service.getMetrics();
    expect(metrics).toEqual({ hits: 2, misses: 2 });
  });

  it('should return expired cached entries', async () => {
    const request = createRequest();

    // Manually insert expired entry
    const expiredResponse: DistanceResponse = {
      distanceMeters: 4000,
      durationSeconds: 500,
      freshness: 'fetched',
      provider: 'google_distance_matrix',
      requestedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
      expiresAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
      source: 'api'
    };

    await cache.putDistance(request, expiredResponse);

    // Service should return expired cache entry
    const response = await service.getDistance(request);

    expect(response).toMatchObject({
      distanceMeters: 4000,
      durationSeconds: 500,
      freshness: 'expired',
      source: 'cache'
    });

    const metrics = service.getMetrics();
    expect(metrics).toEqual({ hits: 1, misses: 0 });
  });

  it('should reset metrics', async () => {
    const request = createRequest();

    await service.getDistance(request);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(service.getMetrics()).toEqual({ hits: 0, misses: 1 });

    service.resetMetrics();

    expect(service.getMetrics()).toEqual({ hits: 0, misses: 0 });
  });

  it('should continue on cache write failure', async () => {
    // Create a cache that fails on put
    const failingCache = new InMemoryDistanceCache();
    const originalPut = failingCache.putDistance.bind(failingCache);
    failingCache.putDistance = async () => {
      throw new Error('Cache write failed');
    };

    const failingService = new CachedDistanceService(failingCache, client);
    const request = createRequest();

    // Should not throw despite cache write failure
    const response = await failingService.getDistance(request);

    expect(response).toMatchObject({
      distanceMeters: 5000,
      durationSeconds: 600,
      source: 'api'
    });
  });

  it('should handle different departure time buckets', async () => {
    const request1: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      departureTime: new Date('2024-11-09T10:32:00Z') // Buckets to 10:30
    };

    const request2: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      departureTime: new Date('2024-11-09T10:34:59Z') // Also buckets to 10:30
    };

    const request3: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      departureTime: new Date('2024-11-09T10:35:00Z') // Buckets to 10:35
    };

    // First request: miss
    await service.getDistance(request1);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second request (same bucket): hit
    await service.getDistance(request2);

    // Third request (different bucket): miss
    await service.getDistance(request3);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const metrics = service.getMetrics();
    expect(metrics).toEqual({ hits: 1, misses: 2 });
  });
});

