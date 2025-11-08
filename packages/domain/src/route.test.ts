import { describe, expect, it } from 'vitest';

import {
  computeRouteParamsDigest,
  createRouteGeoJson,
  computeNearestNeighborPlan,
  RoutePlan,
  RouteStop
} from './route';

const origin: RouteStop = {
  id: 'origin',
  label: 'Tokyo Station',
  lat: 35.681236,
  lng: 139.767125
};

const destinations: RouteStop[] = [
  { id: 'tokyo-tower', label: 'Tokyo Tower', lat: 35.65858, lng: 139.745433 },
  { id: 'sensoji', label: 'Sensoji Temple', lat: 35.714765, lng: 139.796655 },
  { id: 'skytree', label: 'Tokyo Skytree', lat: 35.710063, lng: 139.8107 }
];

describe('computeNearestNeighborPlan', () => {
  it('returns a deterministic visit order for the provided coordinates', () => {
    const plan = computeNearestNeighborPlan(origin, destinations);

    expect(plan.visitOrder).toEqual(['tokyo-tower', 'sensoji', 'skytree']);
    expect(plan.orderedStops[0]).toMatchObject({
      id: origin.id,
      sequence: 0,
      cumulativeDistanceM: 0
    });
    expect(plan.totalDistanceM).toBeGreaterThan(0);
    expect(plan.totalDurationS).toBeGreaterThan(0);
  });

  it('yields a single origin entry when no destinations are provided', () => {
    const plan = computeNearestNeighborPlan(origin, []);

    expect(plan.visitOrder).toEqual([]);
    expect(plan.orderedStops).toHaveLength(1);
    expect(plan.totalDistanceM).toBe(0);
    expect(plan.totalDurationS).toBe(0);
  });
});

describe('createRouteGeoJson', () => {
  const buildPlan = (): RoutePlan => computeNearestNeighborPlan(origin, destinations);

  it('generates point and line features for a route', () => {
    const plan = buildPlan();
    const geoJson = createRouteGeoJson(plan);

    expect(geoJson.type).toBe('FeatureCollection');
    const pointCount = geoJson.features.filter((feature) => feature.geometry.type === 'Point').length;
    expect(pointCount).toBe(plan.orderedStops.length);

    const line = geoJson.features.find((feature) => feature.geometry.type === 'LineString');
    expect(line).toBeDefined();
    if (line?.geometry.type === 'LineString') {
      expect(line.geometry.coordinates).toHaveLength(plan.orderedStops.length);
    }
  });

  it('duplicates the origin coordinate when only one stop exists', () => {
    const singleStopPlan = computeNearestNeighborPlan(origin, []);
    const geoJson = createRouteGeoJson(singleStopPlan);
    const line = geoJson.features.find((feature) => feature.geometry.type === 'LineString');

    expect(line).toBeDefined();
    if (line?.geometry.type === 'LineString') {
      expect(line.geometry.coordinates).toHaveLength(2);
      expect(line.geometry.coordinates[0]).toEqual(line.geometry.coordinates[1]);
    }
  });
});

describe('computeRouteParamsDigest', () => {
  it('produces the same digest for equivalent payloads', () => {
    const digestA = computeRouteParamsDigest({
      origin,
      destinations,
      options: {
        strategy: 'quality',
        fallbackTolerance: 0.15,
        maxIterations: 4000,
        maxRuntimeSeconds: 30
      }
    });

    const digestB = computeRouteParamsDigest({
      origin: { ...origin, lat: origin.lat + 1e-7 },
      destinations: destinations.map((stop) => ({ ...stop })),
      options: {
        strategy: 'quality',
        fallbackTolerance: 0.15009,
        maxIterations: 4000.4,
        maxRuntimeSeconds: 30
      }
    });

    expect(digestA).toBe(digestB);
  });

  it('changes when destinations differ', () => {
    const digestA = computeRouteParamsDigest({ origin, destinations });
    const digestB = computeRouteParamsDigest({
      origin,
      destinations: destinations.slice().reverse()
    });

    expect(digestA).not.toBe(digestB);
  });
});
