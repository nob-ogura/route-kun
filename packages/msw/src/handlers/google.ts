import { http, HttpResponse } from 'msw';

import {
  googleRateLimitErrorFixture,
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

export const googleDistanceMatrixSuccessHandler = http.get(DISTANCE_MATRIX_URL, () => {
  return HttpResponse.json(tokyoDistanceMatrixFixture);
});

export const googleDistanceMatrixRateLimitHandler = http.get(DISTANCE_MATRIX_URL, () => {
  return HttpResponse.json(googleRateLimitErrorFixture, { status: 429 });
});

export const googleHandlers = [googleGeocodeSuccessHandler, googleDistanceMatrixSuccessHandler];
