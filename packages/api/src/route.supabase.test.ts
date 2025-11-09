import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createSupabaseClient } from '@route-kun/supabase';
import { createSupabaseRouteRepository, type RouteRepositorySavePayload } from './route-repository';

// This test requires a real Supabase instance
// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables to run
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const shouldSkip = !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(shouldSkip)('Supabase Route Repository Integration', () => {
  let repository: ReturnType<typeof createSupabaseRouteRepository>;
  let client: ReturnType<typeof createSupabaseClient>;
  const testUserId = '00000000-0000-0000-0000-000000000001';

  beforeAll(() => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    }

    client = createSupabaseClient({
      url: SUPABASE_URL,
      key: SUPABASE_SERVICE_ROLE_KEY
    });

    repository = createSupabaseRouteRepository(client);
  });

  beforeEach(async () => {
    // Clean up test data
    await client.from('route_stops').delete().eq('user_id', testUserId);
    await client.from('routes').delete().eq('user_id', testUserId);
  });

  afterAll(async () => {
    // Final cleanup
    await client.from('route_stops').delete().eq('user_id', testUserId);
    await client.from('routes').delete().eq('user_id', testUserId);
  });

  const createTestPayload = (overrides?: Partial<RouteRepositorySavePayload>): RouteRepositorySavePayload => ({
    userId: testUserId,
    routeId: crypto.randomUUID(),
    algorithm: 'optimizer',
    origin: {
      id: 'origin-1',
      label: 'Tokyo Station',
      lat: 35.681236,
      lng: 139.767125
    },
    orderedStops: [
      {
        id: 'origin-1',
        label: 'Tokyo Station',
        lat: 35.681236,
        lng: 139.767125,
        sequence: 0,
        distanceFromPreviousM: 0,
        durationFromPreviousS: 0,
        cumulativeDistanceM: 0,
        cumulativeDurationS: 0,
        rawInput: {
          id: 'origin-1',
          label: 'Tokyo Station',
          lat: 35.681236,
          lng: 139.767125
        }
      },
      {
        id: 'dest-1',
        label: 'Tokyo Tower',
        lat: 35.658581,
        lng: 139.745438,
        sequence: 1,
        distanceFromPreviousM: 3200,
        durationFromPreviousS: 950,
        cumulativeDistanceM: 3200,
        cumulativeDurationS: 950,
        rawInput: {
          id: 'dest-1',
          label: 'Tokyo Tower',
          lat: 35.658581,
          lng: 139.745438
        }
      }
    ],
    totalDistanceM: 3200,
    totalDurationS: 950,
    paramsDigest: 'test-digest-123',
    paramsSnapshot: {
      origin: {
        id: 'origin-1',
        label: 'Tokyo Station',
        lat: 35.681236,
        lng: 139.767125
      },
      destinations: [
        {
          id: 'dest-1',
          label: 'Tokyo Tower',
          lat: 35.658581,
          lng: 139.745438
        }
      ],
      options: {}
    },
    diagnostics: {
      optimizer: null,
      fallbackUsed: false,
      fallbackReason: null,
      fallbackStrategy: null
    },
    distanceCacheMetrics: {
      hits: 0,
      misses: 2
    },
    ...overrides
  });

  it('should save and retrieve route', async () => {
    const payload = createTestPayload();

    // Save route
    await repository.saveRouteResult(payload);

    // Retrieve route
    const retrieved = await repository.getRoute(testUserId, payload.routeId);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.routeId).toBe(payload.routeId);
    expect(retrieved?.algorithm).toBe('optimizer');
    expect(retrieved?.totalDistanceM).toBe(3200);
    expect(retrieved?.stops).toHaveLength(2);
  });

  it('should list routes in descending order', async () => {
    const payload1 = createTestPayload();
    const payload2 = createTestPayload();

    await repository.saveRouteResult(payload1);
    // Add small delay to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));
    await repository.saveRouteResult(payload2);

    const result = await repository.listRoutes({ userId: testUserId });

    expect(result.routes).toHaveLength(2);
    // Most recent first
    expect(result.routes[0]?.routeId).toBe(payload2.routeId);
    expect(result.routes[1]?.routeId).toBe(payload1.routeId);
  });

  it('should paginate routes', async () => {
    // Create 3 routes
    for (let i = 0; i < 3; i++) {
      await repository.saveRouteResult(createTestPayload());
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Get first page with limit 2
    const page1 = await repository.listRoutes({ userId: testUserId, limit: 2 });

    expect(page1.routes).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    // Get second page
    const page2 = await repository.listRoutes({
      userId: testUserId,
      limit: 2,
      cursor: page1.nextCursor!
    });

    expect(page2.routes).toHaveLength(1);
  });

  it('should store distance cache metrics', async () => {
    const payload = createTestPayload({
      distanceCacheMetrics: {
        hits: 5,
        misses: 3
      }
    });

    await repository.saveRouteResult(payload);

    const retrieved = await repository.getRoute(testUserId, payload.routeId);

    expect(retrieved?.distanceCacheHitCount).toBe(5);
    expect(retrieved?.distanceCacheMissCount).toBe(3);
  });

  it('should return null for non-existent route', async () => {
    const result = await repository.getRoute(testUserId, crypto.randomUUID());

    expect(result).toBeNull();
  });

  it('should not retrieve routes from other users', async () => {
    const payload = createTestPayload();
    await repository.saveRouteResult(payload);

    // Try to retrieve with different user ID
    const differentUserId = '00000000-0000-0000-0000-000000000002';
    const result = await repository.getRoute(differentUserId, payload.routeId);

    expect(result).toBeNull();
  });
});

