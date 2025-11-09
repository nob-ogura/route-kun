import type { DistanceRequest, DistanceResponse } from './distance-cache';

/**
 * Google Distance Matrix API response types
 */
type GoogleDistanceMatrixStatus =
  | 'OK'
  | 'INVALID_REQUEST'
  | 'MAX_ELEMENTS_EXCEEDED'
  | 'OVER_DAILY_LIMIT'
  | 'OVER_QUERY_LIMIT'
  | 'REQUEST_DENIED'
  | 'UNKNOWN_ERROR';

type GoogleDistanceMatrixElementStatus =
  | 'OK'
  | 'NOT_FOUND'
  | 'ZERO_RESULTS'
  | 'MAX_ROUTE_LENGTH_EXCEEDED';

type GoogleDistanceMatrixElement = {
  status: GoogleDistanceMatrixElementStatus;
  distance?: {
    text: string;
    value: number; // meters
  };
  duration?: {
    text: string;
    value: number; // seconds
  };
  duration_in_traffic?: {
    text: string;
    value: number;
  };
};

type GoogleDistanceMatrixResponse = {
  status: GoogleDistanceMatrixStatus;
  error_message?: string;
  origin_addresses: string[];
  destination_addresses: string[];
  rows: Array<{
    elements: GoogleDistanceMatrixElement[];
  }>;
};

/**
 * Google Distance Matrix API client error
 */
export class GoogleDistanceClientError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_REQUEST' | 'RATE_LIMIT' | 'SERVER_ERROR' | 'NETWORK' | 'NOT_FOUND',
    public readonly statusCode?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'GoogleDistanceClientError';
  }
}

/**
 * Retry configuration
 */
type RetryConfig = {
  maxRetries: number;
  delayMs: number[];
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  delayMs: [1000, 4000, 10000] // Exponential backoff: 1s, 4s, 10s
};

/**
 * Sleep helper for retries
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Google Distance Matrix API client
 */
export interface GoogleDistanceClient {
  /**
   * Fetch distance between origin and destination
   */
  fetchDistance(request: DistanceRequest): Promise<DistanceResponse>;
}

/**
 * HTTP implementation of Google Distance Matrix API client
 */
export class HttpGoogleDistanceClient implements GoogleDistanceClient {
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';

  constructor(
    private readonly apiKey: string,
    private readonly retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {}

  async fetchDistance(request: DistanceRequest): Promise<DistanceResponse> {
    const url = this.buildUrl(request);
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await fetch(url);

        // Handle HTTP errors
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500) {
            // 4xx errors: don't retry
            throw new GoogleDistanceClientError(
              `Google API returned ${response.status}`,
              'INVALID_REQUEST',
              response.status
            );
          }

          // 5xx errors: retry
          throw new GoogleDistanceClientError(
            `Google API server error: ${response.status}`,
            'SERVER_ERROR',
            response.status
          );
        }

        const data = (await response.json()) as GoogleDistanceMatrixResponse;

        // Handle API-level errors
        if (data.status !== 'OK') {
          if (data.status === 'OVER_QUERY_LIMIT' || data.status === 'OVER_DAILY_LIMIT') {
            throw new GoogleDistanceClientError(
              `Rate limit exceeded: ${data.error_message ?? 'Unknown'}`,
              'RATE_LIMIT'
            );
          }

          if (
            data.status === 'INVALID_REQUEST' ||
            data.status === 'REQUEST_DENIED' ||
            data.status === 'MAX_ELEMENTS_EXCEEDED'
          ) {
            throw new GoogleDistanceClientError(
              `Invalid request: ${data.error_message ?? data.status}`,
              'INVALID_REQUEST'
            );
          }

          throw new GoogleDistanceClientError(
            `API error: ${data.status} - ${data.error_message ?? 'Unknown'}`,
            'SERVER_ERROR'
          );
        }

        // Extract distance/duration from first element
        const element = data.rows[0]?.elements[0];
        if (!element || element.status !== 'OK') {
          throw new GoogleDistanceClientError(
            `No route found: ${element?.status ?? 'UNKNOWN'}`,
            'NOT_FOUND'
          );
        }

        if (!element.distance || !element.duration) {
          throw new GoogleDistanceClientError(
            'Missing distance or duration in response',
            'INVALID_REQUEST'
          );
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        return {
          distanceMeters: element.distance.value,
          durationSeconds: element.duration.value,
          freshness: 'fetched',
          provider: 'google_distance_matrix',
          requestedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          source: 'api'
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on 4xx or NOT_FOUND
        if (
          error instanceof GoogleDistanceClientError &&
          (error.code === 'INVALID_REQUEST' || error.code === 'NOT_FOUND')
        ) {
          throw error;
        }

        // Retry on 5xx, RATE_LIMIT, or NETWORK errors
        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.retryConfig.delayMs[attempt] ?? 1000;
          console.warn(
            `[google-distance-client] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
            lastError.message
          );
          await sleep(delay);
          continue;
        }

        // Max retries exceeded
        break;
      }
    }

    // All retries failed
    if (lastError instanceof GoogleDistanceClientError) {
      throw lastError;
    }

    throw new GoogleDistanceClientError(
      `Failed after ${this.retryConfig.maxRetries} retries: ${lastError?.message ?? 'Unknown'}`,
      'NETWORK',
      undefined,
      lastError
    );
  }

  private buildUrl(request: DistanceRequest): string {
    const params = new URLSearchParams({
      origins: `${request.origin.lat},${request.origin.lng}`,
      destinations: `${request.destination.lat},${request.destination.lng}`,
      mode: request.mode ?? 'driving',
      key: this.apiKey
    });

    if (request.options?.trafficModel) {
      params.set('traffic_model', request.options.trafficModel);
    }

    if (request.options?.unitSystem) {
      params.set('units', request.options.unitSystem === 'imperial' ? 'imperial' : 'metric');
    }

    if (request.departureTime) {
      params.set('departure_time', Math.floor(request.departureTime.getTime() / 1000).toString());
    }

    return `${this.baseUrl}?${params.toString()}`;
  }
}

/**
 * Mock implementation for testing (always returns fixed distance)
 */
export class MockGoogleDistanceClient implements GoogleDistanceClient {
  constructor(
    private readonly mockDistance: number = 5000,
    private readonly mockDuration: number = 600
  ) {}

  async fetchDistance(_request: DistanceRequest): Promise<DistanceResponse> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return {
      distanceMeters: this.mockDistance,
      durationSeconds: this.mockDuration,
      freshness: 'fetched',
      provider: 'google_distance_matrix_mock',
      requestedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      source: 'api'
    };
  }
}

/**
 * Factory to create Google Distance client
 */
export const createGoogleDistanceClient = (apiKey?: string): GoogleDistanceClient => {
  if (!apiKey) {
    console.warn('[google-distance-client] No API key provided, using mock client');
    return new MockGoogleDistanceClient();
  }

  return new HttpGoogleDistanceClient(apiKey);
};

