import { delay, http, HttpResponse } from 'msw';

import {
  distanceMatrixNotFoundFixture,
  googleRateLimitErrorFixture,
  singleDistanceMatrixFixture,
  tokyoDistanceMatrixFixture,
  tokyoStationGeocodeFixture
} from '../fixtures/google';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';

export const googleGeocodeSuccessHandler = http.get(GEOCODE_URL, () => {
  return HttpResponse.json(tokyoStationGeocodeFixture);
});

export const googleGeocodeRateLimitHandler = http.get(GEOCODE_URL, () => {
  return HttpResponse.json(googleRateLimitErrorFixture, { status: 429 });
});

export const googleGeocodeZeroResultsHandler = http.get(GEOCODE_URL, () => {
  const message = distanceMatrixNotFoundFixture.rows[0]?.elements[0]?.status ?? 'ZERO_RESULTS';
  return HttpResponse.json({
    status: 'ZERO_RESULTS',
    results: [],
    error_message: message
  });
});

export const createGoogleGeocodeRateLimitThenSuccessHandler = (
  onAttempt?: (attempt: number) => void
) => {
  let callCount = 0;
  return http.get(GEOCODE_URL, () => {
    callCount += 1;
    onAttempt?.(callCount);
    if (callCount === 1) {
      return HttpResponse.json(googleRateLimitErrorFixture, { status: 429 });
    }
    return HttpResponse.json(tokyoStationGeocodeFixture);
  });
};

export const createGoogleGeocodeSlowHandler = (delayMs = 7_000) =>
  http.get(GEOCODE_URL, async () => {
    await delay(delayMs);
    return HttpResponse.json(tokyoStationGeocodeFixture);
  });

export const googleDistanceMatrixSuccessHandler = http.get(DISTANCE_MATRIX_URL, () => {
  return HttpResponse.json(tokyoDistanceMatrixFixture);
});

export const googleDistanceMatrixSingleSuccessHandler = http.get(DISTANCE_MATRIX_URL, () => {
  return HttpResponse.json(singleDistanceMatrixFixture);
});

export const googleDistanceMatrixNotFoundHandler = http.get(DISTANCE_MATRIX_URL, () => {
  return HttpResponse.json(distanceMatrixNotFoundFixture);
});

export const googleDistanceMatrixRateLimitHandler = http.get(DISTANCE_MATRIX_URL, () => {
  return HttpResponse.json(googleRateLimitErrorFixture, { status: 429 });
});

export const googleDistanceMatrixServerErrorHandler = http.get(DISTANCE_MATRIX_URL, () => {
  return HttpResponse.json({ status: 'UNKNOWN_ERROR', error_message: 'Internal server error' }, { status: 500 });
});

export const googleHandlers = [googleGeocodeSuccessHandler, googleDistanceMatrixSuccessHandler];
