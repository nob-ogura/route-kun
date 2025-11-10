import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { mockServer } from '@route-kun/msw/server';
import { tokyoStationGeocodeFixture } from '@route-kun/msw/fixtures/google';
import {
  createGoogleGeocodeRateLimitThenSuccessHandler,
  createGoogleGeocodeSlowHandler,
  googleGeocodeZeroResultsHandler
} from '@route-kun/msw/handlers/google';

import { geocodeAddresses, GeocodeError } from './geocode-client';
import { getGeocodeCache } from './geocode-cache';

describe('geocodeAddresses', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    getGeocodeCache().clear();
  });

  it('returns coordinates for a successful geocode request', async () => {
    const [result] = await geocodeAddresses(['東京駅']);

    expect(result.lat).toBe(tokyoStationGeocodeFixture.results[0]?.geometry.location.lat);
    expect(result.lng).toBe(tokyoStationGeocodeFixture.results[0]?.geometry.location.lng);
  });

  it('retries a 429 response and eventually succeeds', async () => {
    vi.useFakeTimers();
    const attempts: number[] = [];
    mockServer.use(createGoogleGeocodeRateLimitThenSuccessHandler((attempt) => attempts.push(attempt)));

    const geocodePromise = geocodeAddresses(['東京駅']);

    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1500);

    const [result] = await geocodePromise;

    expect(result.lat).toBe(tokyoStationGeocodeFixture.results[0]?.geometry.location.lat);
    expect(attempts).toHaveLength(2);
  });

  it('throws a NOT_FOUND error when the API returns ZERO_RESULTS', async () => {
    mockServer.use(googleGeocodeZeroResultsHandler);

    await expect(geocodeAddresses(['存在しない住所'])).rejects.toMatchObject({
      code: 'NOT_FOUND'
    } as Partial<GeocodeError>);
  });

  it('converts an AbortError into a TIMEOUT GeocodeError when the request exceeds 6 seconds', async () => {
    vi.useFakeTimers();

    mockServer.use(createGoogleGeocodeSlowHandler(7_000));

    const geocodePromise = geocodeAddresses(['タイムアウト住所']);
    const expectation = expect(geocodePromise).rejects.toMatchObject({
      code: 'TIMEOUT'
    } as Partial<GeocodeError>);

    await vi.advanceTimersByTimeAsync(7_000);
    await vi.runOnlyPendingTimersAsync();

    await expectation;
  });
});
