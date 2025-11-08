import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  mockServer,
  optimizerFallbackHandler,
  optimizerServerErrorHandler
} from '@route-kun/msw';
import { createOptimizerClient } from '@route-kun/optimizer-client';

import { createInMemoryRouteRepository } from './route-repository';
import { createAppRouter } from './router';

const origin = {
  id: 'origin',
  label: 'Tokyo Station',
  lat: 35.681236,
  lng: 139.767125
};

const destinations = [
  { id: 'tokyo-tower', label: 'Tokyo Tower', lat: 35.65858, lng: 139.745433 },
  { id: 'sensoji', label: 'Sensoji Temple', lat: 35.714765, lng: 139.796655 },
  { id: 'skytree', label: 'Tokyo Skytree', lat: 35.710063, lng: 139.8107 }
];

const baseInput = {
  origin,
  destinations
};

const createCaller = (
  overrides?: Parameters<typeof createAppRouter>[0],
  ctx: { userId: string } = { userId: 'test-user' }
) => createAppRouter(overrides).createCaller(ctx);

beforeAll(() => mockServer.listen());
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe('route.optimize tRPC procedure', () => {
  it('returns the optimizer plan and geojson when diagnostics are healthy', async () => {
    const caller = createCaller();
    const response = await caller.route.optimize(baseInput);

    expect(response.plan.visitOrder).toEqual(['tokyo-tower', 'sensoji', 'skytree']);
    expect(response.diagnostics.fallbackUsed).toBe(false);
    expect(response.geoJson.features.some((feature) => feature.geometry.type === 'LineString')).toBe(
      true
    );
  });

  it('falls back when the optimizer service signals fallback usage', async () => {
    mockServer.use(optimizerFallbackHandler);
    const caller = createCaller();

    const response = await caller.route.optimize(baseInput);

    expect(response.diagnostics.fallbackUsed).toBe(true);
    expect(response.diagnostics.fallbackReason).toBe('optimizer_fallback_signaled');
    expect(response.plan.visitOrder).toEqual(['tokyo-tower', 'sensoji', 'skytree']);
  });

  it('falls back when the diagnostics gap exceeds the requested tolerance', async () => {
    const caller = createCaller();
    const response = await caller.route.optimize({
      ...baseInput,
      options: {
        fallbackTolerance: 0.01
      }
    });

    expect(response.diagnostics.fallbackUsed).toBe(true);
    expect(response.diagnostics.fallbackReason).toBe('optimizer_gap_exceeded');
    expect(response.plan.visitOrder).toEqual(['tokyo-tower', 'sensoji', 'skytree']);
  });

  it('falls back when the optimizer service returns server errors', async () => {
    mockServer.use(optimizerServerErrorHandler);
    const optimizerClient = createOptimizerClient({
      baseUrl: process.env.OPTIMIZER_SERVICE_URL ?? 'https://optimizer.route-kun.local',
      retryDelaysMs: [],
      timeoutMs: 50
    });

    const caller = createCaller({ optimizerClient });
    const response = await caller.route.optimize(baseInput);

    expect(response.diagnostics.fallbackUsed).toBe(true);
    expect(response.diagnostics.fallbackReason).toBe('optimizer_error');
    expect(response.diagnostics.optimizerErrorCode).toBe('HTTP_5XX');
  });
});

describe('route history APIs', () => {
  it('persists optimized routes and exposes list/get results', async () => {
    const routeRepository = createInMemoryRouteRepository();
    const caller = createCaller({ routeRepository });

    const optimizeResult = await caller.route.optimize(baseInput);
    const list = await caller.route.list({});

    expect(list.routes).toHaveLength(1);
    expect(list.routes[0]?.routeId).toBe(optimizeResult.plan.routeId);
    expect(list.routes[0]?.diagnostics.fallbackUsed).toBe(false);

    const detail = await caller.route.get({ routeId: optimizeResult.plan.routeId });
    expect(detail).not.toBeNull();
    expect(detail?.stops.length).toBeGreaterThan(0);
    expect(detail?.origin.id).toBe(origin.id);
  });

  it('returns null when a route cannot be found', async () => {
    const caller = createCaller();
    const detail = await caller.route.get({ routeId: '00000000-0000-0000-0000-000000000000' });
    expect(detail).toBeNull();
  });
});
