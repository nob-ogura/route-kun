import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HttpGoogleDistanceClient,
  MockGoogleDistanceClient,
  GoogleDistanceClientError,
  type GoogleDistanceClient
} from './google-distance-client';
import type { DistanceRequest } from './distance-cache';

// Mock fetch for testing
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

beforeEach(() => {
  mockFetch.mockReset();
});

describe('HttpGoogleDistanceClient', () => {
  const createRequest = (): DistanceRequest => ({
    origin: { lat: 35.681236, lng: 139.767125 },
    destination: { lat: 35.658581, lng: 139.745438 },
    mode: 'driving',
    departureTime: new Date('2024-11-09T10:30:00Z'),
    options: {
      trafficModel: 'best_guess',
      unitSystem: 'metric'
    }
  });

  it('should fetch distance successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        origin_addresses: ['Origin Address'],
        destination_addresses: ['Destination Address'],
        rows: [
          {
            elements: [
              {
                status: 'OK',
                distance: { text: '5.0 km', value: 5000 },
                duration: { text: '10 mins', value: 600 }
              }
            ]
          }
        ]
      })
    });

    const client = new HttpGoogleDistanceClient('test-api-key');
    const request = createRequest();

    const response = await client.fetchDistance(request);

    expect(response).toMatchObject({
      distanceMeters: 5000,
      durationSeconds: 600,
      freshness: 'fetched',
      provider: 'google_distance_matrix',
      source: 'api'
    });

    expect(response.requestedAt).toBeDefined();
    expect(response.expiresAt).toBeDefined();

    // Check that expiresAt is ~24 hours in the future
    const requestedAt = new Date(response.requestedAt);
    const expiresAt = new Date(response.expiresAt);
    const diffHours = (expiresAt.getTime() - requestedAt.getTime()) / (1000 * 60 * 60);

    expect(diffHours).toBeCloseTo(24, 0);
  });

  it('should build correct URL with all parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        origin_addresses: ['Origin'],
        destination_addresses: ['Destination'],
        rows: [
          {
            elements: [
              {
                status: 'OK',
                distance: { text: '5.0 km', value: 5000 },
                duration: { text: '10 mins', value: 600 }
              }
            ]
          }
        ]
      })
    });

    const client = new HttpGoogleDistanceClient('test-api-key');
    const request: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 },
      mode: 'walking',
      departureTime: new Date('2024-11-09T10:30:00Z'),
      options: {
        trafficModel: 'pessimistic',
        unitSystem: 'imperial'
      }
    };

    const response = await client.fetchDistance(request);

    expect(response).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('mode=walking')
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('traffic_model=pessimistic')
    );
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('units=imperial')
    );
  });

  it('should throw NOT_FOUND error when route not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        origin_addresses: ['Unknown'],
        destination_addresses: ['Unknown'],
        rows: [
          {
            elements: [
              {
                status: 'NOT_FOUND'
              }
            ]
          }
        ]
      })
    });

    const client = new HttpGoogleDistanceClient('test-api-key');
    const request = createRequest();

    try {
      await client.fetchDistance(request);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleDistanceClientError);
      expect(error).toMatchObject({
        code: 'NOT_FOUND'
      });
    }
  });

  it('should throw RATE_LIMIT error and not retry on rate limit', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OVER_QUERY_LIMIT',
        error_message: 'Rate limit exceeded'
      })
    });

    const client = new HttpGoogleDistanceClient('test-api-key', {
      maxRetries: 2,
      delayMs: [10, 20]
    });
    const request = createRequest();

    const start = Date.now();

    try {
      await client.fetchDistance(request);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleDistanceClientError);
      expect(error).toMatchObject({
        code: 'RATE_LIMIT'
      });
    }

    const elapsed = Date.now() - start;

    // Should fail fast without retries
    expect(elapsed).toBeLessThan(1000);
  });

  it('should retry on server error and eventually fail', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        status: 'UNKNOWN_ERROR',
        error_message: 'Internal server error'
      })
    });

    const client = new HttpGoogleDistanceClient('test-api-key', {
      maxRetries: 2,
      delayMs: [10, 20]
    });
    const request = createRequest();

    const start = Date.now();

    await expect(client.fetchDistance(request)).rejects.toThrow(GoogleDistanceClientError);

    const elapsed = Date.now() - start;

    // Should have retried (10ms + 20ms = 30ms minimum)
    expect(elapsed).toBeGreaterThanOrEqual(30);
  });

  it('should handle missing distance or duration', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        origin_addresses: ['Origin'],
        destination_addresses: ['Destination'],
        rows: [
          {
            elements: [
              {
                status: 'OK'
                // Missing distance and duration
              }
            ]
          }
        ]
      })
    });

    const client = new HttpGoogleDistanceClient('test-api-key');
    const request = createRequest();

    try {
      await client.fetchDistance(request);
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(GoogleDistanceClientError);
      expect(error).toMatchObject({
        code: 'INVALID_REQUEST'
      });
    }
  });
});

describe('MockGoogleDistanceClient', () => {
  it('should return mock distance', async () => {
    const client = new MockGoogleDistanceClient(7000, 800);
    const request: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 }
    };

    const response = await client.fetchDistance(request);

    expect(response).toMatchObject({
      distanceMeters: 7000,
      durationSeconds: 800,
      freshness: 'fetched',
      provider: 'google_distance_matrix_mock',
      source: 'api'
    });
  });

  it('should use default values', async () => {
    const client = new MockGoogleDistanceClient();
    const request: DistanceRequest = {
      origin: { lat: 35.681236, lng: 139.767125 },
      destination: { lat: 35.658581, lng: 139.745438 }
    };

    const response = await client.fetchDistance(request);

    expect(response).toMatchObject({
      distanceMeters: 5000,
      durationSeconds: 600
    });
  });
});

