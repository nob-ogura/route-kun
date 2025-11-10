import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Coordinates } from '@route-kun/domain';

import { InMemoryGeocodeCache } from './geocode-cache';

const createCoordinates = (lat: number, lng: number): Coordinates => ({ lat, lng });

afterEach(() => {
  vi.useRealTimers();
});

describe('InMemoryGeocodeCache', () => {
  it('returns cached coordinates within the TTL window without refetching', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const cache = new InMemoryGeocodeCache();
    cache.set('東京都千代田区丸の内1-9-1', createCoordinates(35.0, 139.0));

    expect(cache.get('東京都千代田区丸の内1-9-1')).toEqual(createCoordinates(35.0, 139.0));

    vi.advanceTimersByTime(23 * 60 * 60 * 1000);

    expect(cache.get('東京都千代田区丸の内1-9-1')).toEqual(createCoordinates(35.0, 139.0));

    // Timer mode restored in afterEach
  });

  it('expires cached entries after 24 hours and allows refreshed values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    const cache = new InMemoryGeocodeCache();
    const address = '大阪府大阪市北区梅田3-1-1';

    cache.set(address, createCoordinates(34.7, 135.5));
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);

    expect(cache.get(address)).toBeNull();

    cache.set(address, createCoordinates(34.8, 135.6));

    expect(cache.get(address)).toEqual(createCoordinates(34.8, 135.6));
  });
});
