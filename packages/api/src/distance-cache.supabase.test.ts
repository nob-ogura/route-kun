import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createSupabaseClient } from '@route-kun/supabase';
import { SupabaseDistanceCache, type DistanceRequest, type DistanceResponse } from './distance-cache';

// This test requires a real Supabase instance
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables to run
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const shouldSkip = !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(shouldSkip)('SupabaseDistanceCache Integration', () => {
  let cache: SupabaseDistanceCache;
  let client: ReturnType<typeof createSupabaseClient>;

  beforeAll(() => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }

    client = createSupabaseClient({
      url: SUPABASE_URL,
      key: SUPABASE_SERVICE_ROLE_KEY
    });

    cache = new SupabaseDistanceCache(client);
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await client.from('distance_cache').delete().gte('created_at', '1970-01-01');
  });

  afterAll(async () => {
    // Final cleanup
    await client.from('distance_cache').delete().gte('created_at', '1970-01-01');
  });

  const createTestRequest = (overrides?: Partial<DistanceRequest>): DistanceRequest => ({
    origin: { lat: 35.681236, lng: 139.767125 },
    destination: { lat: 35.658581, lng: 139.745438 },
    mode: 'driving',
    departureTime: new Date('2024-11-09T10:30:00Z'),
    ...overrides
  });

  const createTestResponse = (overrides?: Partial<DistanceResponse>): DistanceResponse => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      distanceMeters: 5000,
      durationSeconds: 600,
      freshness: 'fetched',
      provider: 'google_distance_matrix',
      requestedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      source: 'api',
      ...overrides
    };
  };

  it('should store and retrieve distance data', async () => {
    const request = createTestRequest();
    const response = createTestResponse();

    // Store data
    await cache.putDistance(request, response);

    // Retrieve data
    const retrieved = await cache.getDistance(request);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.distanceMeters).toBe(5000);
    expect(retrieved?.durationSeconds).toBe(600);
    expect(retrieved?.source).toBe('cache');
  });

  it('should return null for non-existent cache entry', async () => {
    const request = createTestRequest();

    const result = await cache.getDistance(request);

    expect(result).toBeNull();
  });

  it('should mark expired entries as expired', async () => {
    const request = createTestRequest();
    const response = createTestResponse({
      expiresAt: new Date(Date.now() - 1000).toISOString() // Expired 1 second ago
    });

    await cache.putDistance(request, response);

    const retrieved = await cache.getDistance(request);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.freshness).toBe('expired');
  });

  it('should update existing entry on put', async () => {
    const request = createTestRequest();
    const response1 = createTestResponse({ distanceMeters: 5000 });
    const response2 = createTestResponse({ distanceMeters: 6000 });

    // First put
    await cache.putDistance(request, response1);

    // Second put with different distance
    await cache.putDistance(request, response2);

    // Should retrieve the updated value
    const retrieved = await cache.getDistance(request);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.distanceMeters).toBe(6000);
  });

  it('should store different entries for different modes', async () => {
    const drivingRequest = createTestRequest({ mode: 'driving' });
    const walkingRequest = createTestRequest({ mode: 'walking' });

    const drivingResponse = createTestResponse({ distanceMeters: 5000 });
    const walkingResponse = createTestResponse({ distanceMeters: 7000 });

    await cache.putDistance(drivingRequest, drivingResponse);
    await cache.putDistance(walkingRequest, walkingResponse);

    const drivingResult = await cache.getDistance(drivingRequest);
    const walkingResult = await cache.getDistance(walkingRequest);

    expect(drivingResult?.distanceMeters).toBe(5000);
    expect(walkingResult?.distanceMeters).toBe(7000);
  });

  it('should increment hit count on multiple reads', async () => {
    const request = createTestRequest();
    const response = createTestResponse();

    await cache.putDistance(request, response);

    // Read multiple times
    await cache.getDistance(request);
    await cache.getDistance(request);
    await cache.getDistance(request);

    // Give time for async increment to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify hit count in database
    const { data } = await client
      .from('distance_cache')
      .select('hit_count')
      .limit(1)
      .single();

    expect(data?.hit_count).toBeGreaterThanOrEqual(3);
  });
});

