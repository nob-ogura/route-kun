'use server';

import { loadEnv } from '@route-kun/config';
import type { Coordinates } from '@route-kun/domain';

import type { GeocodeCache } from './geocode-cache';
import { getGeocodeCache } from './geocode-cache';

export type GeocodeCoordinates = Coordinates;

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const REQUEST_TIMEOUT_MS = 6_000;
const RETRY_DELAYS_MS = [500, 1_500];
const RETRYABLE_ERROR_CODES = new Set<GeocodeErrorCode>(['RATE_LIMIT', 'SERVER_ERROR', 'NETWORK']);

type GoogleGeocodeResponse = {
  status:
    | 'OK'
    | 'ZERO_RESULTS'
    | 'OVER_QUERY_LIMIT'
    | 'OVER_DAILY_LIMIT'
    | 'REQUEST_DENIED'
    | 'INVALID_REQUEST'
    | 'UNKNOWN_ERROR';
  error_message?: string;
  results: Array<{
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
};

export type GeocodeErrorCode =
  | 'RATE_LIMIT'
  | 'INVALID_REQUEST'
  | 'SERVER_ERROR'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'TIMEOUT';

export class GeocodeError extends Error {
  constructor(
    message: string,
    public readonly code: GeocodeErrorCode,
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'GeocodeError';
  }
}

type GeocodeAddressesOptions = {
  cache?: GeocodeCache | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function geocodeAddresses(
  addresses: string[],
  options: GeocodeAddressesOptions = {}
): Promise<GeocodeCoordinates[]> {
  if (addresses.length === 0) {
    return [];
  }

  const cache = options.cache ?? getGeocodeCache();
  const env = loadEnv();
  const apiKey = env.GOOGLE_MAPS_API_KEY;

  const results: GeocodeCoordinates[] = [];

  for (const address of addresses) {
    const cachedCoordinates = cache?.get(address);
    if (cachedCoordinates) {
      results.push(cachedCoordinates);
      continue;
    }

    const coordinates = await geocodeSingleAddress(address, apiKey);
    cache?.set(address, coordinates);
    results.push(coordinates);
  }

  return results;
}

const geocodeSingleAddress = async (address: string, apiKey: string): Promise<GeocodeCoordinates> => {
  let lastError: GeocodeError | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(buildGeocodeUrl(address, apiKey), {
        signal: controller.signal
      });

      if (response.status === 429) {
        throw new GeocodeError(`Google Geocode rate limited for "${address}"`, 'RATE_LIMIT', response.status);
      }

      if (!response.ok) {
        const code = response.status >= 500 ? 'SERVER_ERROR' : 'INVALID_REQUEST';
        throw new GeocodeError(
          `Google Geocode HTTP ${response.status} for "${address}"`,
          code,
          response.status
        );
      }

      const payload = (await response.json()) as GoogleGeocodeResponse;
      const coordinates = extractCoordinates(payload, address);
      clearTimeout(timeoutId);
      return coordinates;
    } catch (error) {
      clearTimeout(timeoutId);
      const normalizedError = normalizeError(error, address);
      lastError = normalizedError;

      if (attempt < RETRY_DELAYS_MS.length && RETRYABLE_ERROR_CODES.has(normalizedError.code)) {
        const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
        await sleep(delay);
        continue;
      }

      throw normalizedError;
    }
  }

  throw lastError ?? new GeocodeError(`Unknown geocode failure for "${address}"`, 'SERVER_ERROR');
};

const buildGeocodeUrl = (address: string, apiKey: string): string => {
  const url = new URL(GEOCODE_URL);
  url.search = new URLSearchParams({
    address,
    key: apiKey
  }).toString();
  return url.toString();
};

const extractCoordinates = (payload: GoogleGeocodeResponse, address: string): GeocodeCoordinates => {
  if (payload.status === 'ZERO_RESULTS') {
    throw new GeocodeError(`住所の場所を特定できませんでした: "${address}"`, 'NOT_FOUND');
  }

  if (payload.status === 'OVER_QUERY_LIMIT' || payload.status === 'OVER_DAILY_LIMIT') {
    throw new GeocodeError(
      `Google Geocode rate limit exceeded for "${address}"`,
      'RATE_LIMIT'
    );
  }

  if (payload.status === 'REQUEST_DENIED' || payload.status === 'INVALID_REQUEST') {
    throw new GeocodeError(
      payload.error_message ?? `Invalid geocode request for "${address}"`,
      'INVALID_REQUEST'
    );
  }

  if (payload.status !== 'OK') {
    throw new GeocodeError(
      payload.error_message ?? `Google Geocode failed with status ${payload.status}`,
      'SERVER_ERROR'
    );
  }

  const location = payload.results[0]?.geometry.location;

  if (!location) {
    throw new GeocodeError(`Missing coordinates in geocode response for "${address}"`, 'SERVER_ERROR');
  }

  return {
    lat: location.lat,
    lng: location.lng
  };
};

const normalizeError = (error: unknown, address: string): GeocodeError => {
  if (error instanceof GeocodeError) {
    return error;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new GeocodeError(
      `Geocode request for "${address}" timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`,
      'TIMEOUT',
      undefined,
      error
    );
  }

  if (error instanceof Error) {
    return new GeocodeError(
      `Geocode request failed for "${address}": ${error.message}`,
      'NETWORK',
      undefined,
      error
    );
  }

  return new GeocodeError(`Geocode request failed for "${address}"`, 'NETWORK');
};
