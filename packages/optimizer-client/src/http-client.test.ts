import { describe, expect, it, vi } from 'vitest';

import { optimizerRequestFixture, optimizerResponseFixture, optimizerWireResponseFixture } from './fixtures/optimizer-contract';
import { createOptimizerClient } from './http-client';
import { OptimizerClientError } from './errors';

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  });

describe('createOptimizerClient', () => {
  it('sends snake_case payloads and decodes camelCase responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(optimizerWireResponseFixture));
    const client = createOptimizerClient({ baseUrl: 'http://optimizer.local', fetchImpl: fetchMock });

    const result = await client.optimize(optimizerRequestFixture);

    expect(result).toEqual(optimizerResponseFixture);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const parsedBody = JSON.parse((init?.body as string) ?? '{}');

    expect(parsedBody).toMatchObject({
      origin: { lat: optimizerRequestFixture.origin.lat },
      distance_matrix: optimizerRequestFixture.distanceMatrix,
      options: {
        fallback_tolerance: optimizerRequestFixture.options.fallbackTolerance,
        max_iterations: optimizerRequestFixture.options.maxIterations
      }
    });
  });

  it('retries when the Optimizer service returns retryable errors', async () => {
    vi.useFakeTimers();
    const responses = [
      new Response('boom', { status: 500 }),
      new Response('again', { status: 502 }),
      jsonResponse(optimizerWireResponseFixture)
    ];
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(responses.shift()!));

    const client = createOptimizerClient({
      baseUrl: 'http://optimizer.local',
      fetchImpl: fetchMock,
      retryDelaysMs: [10, 20, 40]
    });

    const promise = client.optimize(optimizerRequestFixture);

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.routeId).toBe(optimizerResponseFixture.routeId);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable 4xx responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad request', { status: 400 }));
    const client = createOptimizerClient({ baseUrl: 'http://optimizer.local', fetchImpl: fetchMock });

    await expect(client.optimize(optimizerRequestFixture)).rejects.toMatchObject<Partial<OptimizerClientError>>({
      code: 'HTTP_4XX',
      status: 400
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies timeouts explicitly', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const client = createOptimizerClient({
      baseUrl: 'http://optimizer.local',
      fetchImpl: fetchMock,
      retryDelaysMs: []
    });

    await expect(client.optimize(optimizerRequestFixture)).rejects.toMatchObject<Partial<OptimizerClientError>>({
      code: 'TIMEOUT'
    });
  });

  it('surfaces decode failures with detailed context', async () => {
    const brokenPayload: Record<string, unknown> = { ...optimizerWireResponseFixture };
    delete brokenPayload.route_id;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(brokenPayload));
    const client = createOptimizerClient({ baseUrl: 'http://optimizer.local', fetchImpl: fetchMock });

    await expect(client.optimize(optimizerRequestFixture)).rejects.toMatchObject<Partial<OptimizerClientError>>({
      code: 'DECODE'
    });
  });
});
