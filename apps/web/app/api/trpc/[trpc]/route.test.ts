import { describe, it, expect, beforeEach, vi } from 'vitest';

import { type inferRouterOutputs } from '@trpc/server';
import superjson from 'superjson';

import { createAppRouter, type AppRouter } from '@route-kun/api';
import * as correlationLogger from '@route-kun/api/middleware/correlation';
import {
  createInMemoryRouteRepository,
  type RouteRepositorySavePayload
} from '@route-kun/api/route-repository';

import { createTrpcHandler } from './handler';

const { cookiesMock, headersMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  headersMock: vi.fn()
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
  headers: headersMock
}));

const logRequestStartSpy = vi.spyOn(correlationLogger, 'logRequestStart');
const logRequestEndSpy = vi.spyOn(correlationLogger, 'logRequestEnd');

let currentUserId: string | undefined;
let currentHeaders: Record<string, string>;

const setUserCookie = (userId?: string) => {
  currentUserId = userId;
};

const setRequestHeader = (name: string, value?: string) => {
  if (!value) {
    delete currentHeaders[name];
    return;
  }

  currentHeaders[name] = value;
};

type RouteListResult = inferRouterOutputs<AppRouter>['route']['list'];

type TrpcErrorShape = {
  message: string;
  code: number;
  data: {
    code: string;
    httpStatus: number;
    [key: string]: unknown;
  };
};

const createRouteListRequest = (input: Record<string, unknown>) => {
  const url = new URL('http://localhost/api/trpc/route.list');
  url.searchParams.set('input', JSON.stringify(superjson.serialize(input)));
  return new Request(url.toString());
};

const createRoutePayload = (
  overrides?: Partial<RouteRepositorySavePayload>
): RouteRepositorySavePayload => ({
  userId: 'user-123',
  routeId: '11111111-1111-1111-1111-111111111111',
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
  paramsDigest: 'test-digest',
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
    hits: 1,
    misses: 0
  },
  ...overrides
});

describe('tRPC route handler', () => {
  beforeEach(() => {
    currentUserId = undefined;
    currentHeaders = {};
    cookiesMock.mockReset();
    headersMock.mockReset();
    cookiesMock.mockImplementation(() => ({
      get: (name: string) => {
        if (name !== 'routekun.userId' || !currentUserId) {
          return undefined;
        }
        return { name, value: currentUserId };
      }
    }));
    headersMock.mockImplementation(() => {
      const headerBag = new Headers();
      Object.entries(currentHeaders).forEach(([key, value]) => headerBag.set(key, value));
      return headerBag;
    });
    logRequestStartSpy.mockClear();
    logRequestEndSpy.mockClear();
  });

  it('returns 401 when no user context is provided', async () => {
    const router = createAppRouter({
      routeRepository: createInMemoryRouteRepository()
    });
    const handler = createTrpcHandler(router);

    const response = await handler(createRouteListRequest({ limit: 5 }));

    expect(response.status).toBe(401);
    const payload = await response.json();
    const errorPayload = payload.error;
    expect(errorPayload).toBeDefined();
    const error = superjson.deserialize<TrpcErrorShape>(errorPayload);
    expect(error.code).toBe(-32001);
    expect(error.data.code).toBe('UNAUTHORIZED');
  });

  it('propagates correlation IDs and returns repository data', async () => {
    const repository = createInMemoryRouteRepository();
    const payload = createRoutePayload();
    await repository.saveRouteResult(payload);

    setUserCookie(payload.userId);
    setRequestHeader('x-request-id', 'request-123');

    const router = createAppRouter({ routeRepository: repository });
    const handler = createTrpcHandler(router);
    const response = await handler(createRouteListRequest({ limit: 5 }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('x-correlation-id')).toBe('request-123');
    expect(body.result).toBeDefined();
    const resultPayload = body.result?.data;
    expect(resultPayload).toBeDefined();
    const result = superjson.deserialize<RouteListResult>(resultPayload);
    expect(result.routes).toHaveLength(1);
    expect(result.routes?.[0]?.routeId).toBe(payload.routeId);

    expect(logRequestStartSpy).toHaveBeenCalledWith('query.route.list', 'request-123');
    const endCall = logRequestEndSpy.mock.calls.find(([path]) => path === 'query.route.list');
    expect(endCall?.[1]).toBe('request-123');
    expect(typeof endCall?.[2]).toBe('number');
    expect(endCall?.[3]).toBeUndefined();
  });
});
