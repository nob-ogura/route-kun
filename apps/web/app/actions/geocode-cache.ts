'use server';

import type { Coordinates } from '@route-kun/domain';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface GeocodeCache {
  get(address: string): Coordinates | null;
  set(address: string, coordinates: Coordinates): void;
}

type CacheEntry = {
  coordinates: Coordinates;
  expiresAt: number;
};

export class InMemoryGeocodeCache implements GeocodeCache {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs: number = TWENTY_FOUR_HOURS_MS) {}

  get(address: string): Coordinates | null {
    const entry = this.store.get(address);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(address);
      return null;
    }

    return entry.coordinates;
  }

  set(address: string, coordinates: Coordinates): void {
    this.store.set(address, {
      coordinates,
      expiresAt: Date.now() + this.ttlMs
    });
  }

  clear(): void {
    this.store.clear();
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __routeKunGeocodeCache: InMemoryGeocodeCache | undefined;
}

export const getGeocodeCache = (): InMemoryGeocodeCache => {
  if (!globalThis.__routeKunGeocodeCache) {
    globalThis.__routeKunGeocodeCache = new InMemoryGeocodeCache();
  }

  return globalThis.__routeKunGeocodeCache;
};
