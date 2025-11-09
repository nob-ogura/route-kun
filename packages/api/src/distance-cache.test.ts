import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryDistanceCache,
  makeDistanceCacheKey,
  makeRequestFingerprint,
  type DistanceRequest,
  type DistanceResponse
} from './distance-cache';

describe('makeDistanceCacheKey', () => {
  it('should generate consistent keys for same request', () => {
    const request: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      mode: 'driving',
      departureTime: new Date('2024-11-09T10:30:00Z'),
      options: {
        trafficModel: 'best_guess',
        unitSystem: 'metric'
      }
    };

    const key1 = makeDistanceCacheKey(request);
    const key2 = makeDistanceCacheKey(request);

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
  });

  it('should normalize coordinates to 6 decimal places', () => {
    const departureTime = new Date('2024-11-09T10:30:00Z');

    // These coordinates differ only after 6 decimal places and round to the same value
    const request1: DistanceRequest = {
      origin: { lat: 35.6812361111, lng: 139.7671251111 },
      destination: { lat: 35.658581, lng: 139.745438 },
      departureTime
    };

    const request2: DistanceRequest = {
      origin: { lat: 35.6812364444, lng: 139.7671254444 },
      destination: { lat: 35.658581, lng: 139.745438 },
      departureTime
    };

    const key1 = makeDistanceCacheKey(request1);
    const key2 = makeDistanceCacheKey(request2);

    // Both should round to 35.681236, 139.767125
    expect(key1).toBe(key2);
  });

  it('should bucket departure time to 5-minute intervals', () => {
    const request1: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      departureTime: new Date('2024-11-09T10:32:00Z') // 10:32
    };

    const request2: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      departureTime: new Date('2024-11-09T10:34:59Z') // 10:34:59
    };

    const key1 = makeDistanceCacheKey(request1);
    const key2 = makeDistanceCacheKey(request2);

    // Both should bucket to 10:30
    expect(key1).toBe(key2);
  });

  it('should generate different keys for different modes', () => {
    const baseRequest: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 }
    };

    const drivingKey = makeDistanceCacheKey({ ...baseRequest, mode: 'driving' });
    const walkingKey = makeDistanceCacheKey({ ...baseRequest, mode: 'walking' });

    expect(drivingKey).not.toBe(walkingKey);
  });

  it('should use default values for optional fields', () => {
    const minimalRequest: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 }
    };

    const explicitRequest: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      mode: 'driving',
      options: {
        trafficModel: 'best_guess',
        unitSystem: 'metric'
      }
    };

    const key1 = makeDistanceCacheKey(minimalRequest);
    const key2 = makeDistanceCacheKey(explicitRequest);

    // Keys should be different because departureTime defaults to current time
    // But the structure should be the same if we use the same timestamp
    const now = new Date();
    const key3 = makeDistanceCacheKey({ ...minimalRequest, departureTime: now });
    const key4 = makeDistanceCacheKey({ ...explicitRequest, departureTime: now });

    expect(key3).toBe(key4);
  });
});

describe('makeRequestFingerprint', () => {
  it('should generate consistent fingerprints', () => {
    const request: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      options: {
        trafficModel: 'pessimistic',
        unitSystem: 'imperial'
      }
    };

    const fp1 = makeRequestFingerprint(request);
    const fp2 = makeRequestFingerprint(request);

    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should generate different fingerprints for different options', () => {
    const request1: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      options: { trafficModel: 'best_guess' }
    };

    const request2: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      options: { trafficModel: 'optimistic' }
    };

    const fp1 = makeRequestFingerprint(request1);
    const fp2 = makeRequestFingerprint(request2);

    expect(fp1).not.toBe(fp2);
  });
});

describe('InMemoryDistanceCache', () => {
  let cache: InMemoryDistanceCache;

  beforeEach(() => {
    cache = new InMemoryDistanceCache();
  });

  const createRequest = (): DistanceRequest => ({
    origin: { lat: 35.681236, lng: 139.767125 },
    destination: { lat: 35.658581, lng: 139.745438 },
    mode: 'driving',
    departureTime: new Date('2024-11-09T10:30:00Z')
  });

  const createResponse = (overrides?: Partial<DistanceResponse>): DistanceResponse => ({
    distanceMeters: 5000,
    durationSeconds: 600,
    freshness: 'fetched',
    provider: 'google_distance_matrix',
    requestedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    source: 'api',
    ...overrides
  });

  it('should return null for cache miss', async () => {
    const request = createRequest();
    const result = await cache.getDistance(request);

    expect(result).toBeNull();
  });

  it('should return cached entry for cache hit', async () => {
    const request = createRequest();
    const response = createResponse();

    await cache.putDistance(request, response);
    const result = await cache.getDistance(request);

    expect(result).not.toBeNull();
    expect(result?.distanceMeters).toBe(5000);
    expect(result?.durationSeconds).toBe(600);
    expect(result?.source).toBe('cache');
  });

  it('should mark expired entries as expired', async () => {
    const request = createRequest();
    const response = createResponse({
      expiresAt: new Date(Date.now() - 1000).toISOString() // Expired 1 second ago
    });

    await cache.putDistance(request, response);
    const result = await cache.getDistance(request);

    expect(result).not.toBeNull();
    expect(result?.freshness).toBe('expired');
  });

  it('should mark fresh entries as fresh', async () => {
    const request = createRequest();
    const response = createResponse({
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Expires in 24 hours
    });

    await cache.putDistance(request, response);
    const result = await cache.getDistance(request);

    expect(result).not.toBeNull();
    expect(result?.freshness).toBe('fresh');
  });

  it('should store different entries for different keys', async () => {
    const request1 = createRequest();
    const request2 = { ...createRequest(), mode: 'walking' as const };

    const response1 = createResponse({ distanceMeters: 5000 });
    const response2 = createResponse({ distanceMeters: 6000 });

    await cache.putDistance(request1, response1);
    await cache.putDistance(request2, response2);

    const result1 = await cache.getDistance(request1);
    const result2 = await cache.getDistance(request2);

    expect(result1?.distanceMeters).toBe(5000);
    expect(result2?.distanceMeters).toBe(6000);
  });

  it('should overwrite existing entry on put', async () => {
    const request = createRequest();
    const response1 = createResponse({ distanceMeters: 5000 });
    const response2 = createResponse({ distanceMeters: 6000 });

    await cache.putDistance(request, response1);
    await cache.putDistance(request, response2);

    const result = await cache.getDistance(request);

    expect(result?.distanceMeters).toBe(6000);
  });

  it('should clear all entries', async () => {
    const request = createRequest();
    const response = createResponse();

    await cache.putDistance(request, response);
    expect(cache.size()).toBe(1);

    cache.clear();
    expect(cache.size()).toBe(0);

    const result = await cache.getDistance(request);
    expect(result).toBeNull();
  });
});

