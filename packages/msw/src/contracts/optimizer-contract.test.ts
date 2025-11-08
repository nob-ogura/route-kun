import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';

import {
  createOptimizerClient,
  optimizerRequestFixture,
  optimizerResponseFixture
} from '@route-kun/optimizer-client';

import { mockServer } from '../server';
import {
  optimizerFallbackHandler,
  optimizerServerErrorHandler,
  optimizerTimeoutHandler
} from '../handlers/optimizer';

const OPTIMIZER_BASE_URL = 'https://optimizer.route-kun.local';

const createTestClient = (overrides: Partial<Parameters<typeof createOptimizerClient>[0]> = {}) => {
  return createOptimizerClient({
    baseUrl: OPTIMIZER_BASE_URL,
    timeoutMs: 50,
    retryDelaysMs: [],
    ...overrides
  });
};

beforeAll(() => mockServer.listen());
afterEach(() => mockServer.resetHandlers());
afterAll(() => mockServer.close());

describe('Optimizer MSW contract', () => {
  it('returns normalized DTOs for the happy path handler', async () => {
    const client = createTestClient();
    const result = await client.optimize(optimizerRequestFixture);

    expect(result).toEqual(optimizerResponseFixture);
  });

  it('exposes fallback metadata when the fallback handler is active', async () => {
    mockServer.use(optimizerFallbackHandler);
    const client = createTestClient();

    const result = await client.optimize(optimizerRequestFixture);

    expect(result.diagnostics.fallbackUsed).toBe(true);
    expect(result.totalDistanceM).toBeGreaterThan(optimizerResponseFixture.totalDistanceM);
  });

  it('classifies HTTP 5xx responses from the Optimizer service', async () => {
    mockServer.use(optimizerServerErrorHandler);
    const client = createTestClient({ retryDelaysMs: [10, 20] });

    await expect(client.optimize(optimizerRequestFixture)).rejects.toMatchObject({
      code: 'HTTP_5XX',
      status: 502
    });
  });

  it('surfaces decode failures when the Optimizer payload breaks the contract', async () => {
    mockServer.use(
      http.post('*/optimize', async ({ request }) => {
        await request.json();
        return HttpResponse.json({ route_id: 'abc' });
      })
    );

    const client = createTestClient();

    await expect(client.optimize(optimizerRequestFixture)).rejects.toMatchObject({
      code: 'DECODE'
    });
  });

  it('treats excessively slow responses as timeouts', async () => {
    mockServer.use(optimizerTimeoutHandler);
    const client = createTestClient({ timeoutMs: 15 });

    await expect(client.optimize(optimizerRequestFixture)).rejects.toMatchObject({
      code: 'TIMEOUT'
    });
  });
});
