import { z } from 'zod';

const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;
const EARTH_RADIUS_M = 6_371_000;
const AVERAGE_CITY_SPEED_MPS = 13.8889; // ~= 50km/h

export const CoordinatesSchema = z.object({
  lat: z.number().gte(MIN_LATITUDE).lte(MAX_LATITUDE),
  lng: z.number().gte(MIN_LONGITUDE).lte(MAX_LONGITUDE)
});

export const RouteStopSchema = CoordinatesSchema.extend({
  id: z.string().min(1),
  label: z.string().min(1).optional()
});

export const OrderedRouteStopSchema = RouteStopSchema.extend({
  sequence: z.number().int().nonnegative(),
  distanceFromPreviousM: z.number().int().nonnegative(),
  durationFromPreviousS: z.number().int().nonnegative(),
  cumulativeDistanceM: z.number().int().nonnegative(),
  cumulativeDurationS: z.number().int().nonnegative()
});

export type Coordinates = z.infer<typeof CoordinatesSchema>;
export type RouteStop = z.infer<typeof RouteStopSchema>;
export type OrderedRouteStop = z.infer<typeof OrderedRouteStopSchema>;

export interface RoutePlan {
  visitOrder: string[];
  orderedStops: OrderedRouteStop[];
  totalDistanceM: number;
  totalDurationS: number;
}

type GeoJsonPointFeature = {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  properties: {
    id: string;
    label?: string;
    sequence: number;
    cumulativeDistanceM: number;
    cumulativeDurationS: number;
  };
};

type GeoJsonLineFeature = {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  properties: {
    totalDistanceM: number;
    totalDurationS: number;
  };
};

export type RouteGeoJson = {
  type: 'FeatureCollection';
  features: (GeoJsonPointFeature | GeoJsonLineFeature)[];
};

const roundToInt = (value: number): number => Math.max(0, Math.round(value));

const haversineDistance = (a: Coordinates, b: Coordinates): number => {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

const estimateDurationSeconds = (distanceMeters: number): number => {
  if (distanceMeters <= 0) {
    return 0;
  }

  return distanceMeters / AVERAGE_CITY_SPEED_MPS;
};

const createOriginStop = (origin: RouteStop): OrderedRouteStop => ({
  id: origin.id,
  label: origin.label,
  lat: origin.lat,
  lng: origin.lng,
  sequence: 0,
  distanceFromPreviousM: 0,
  durationFromPreviousS: 0,
  cumulativeDistanceM: 0,
  cumulativeDurationS: 0
});

export function computeNearestNeighborPlan(origin: RouteStop, destinations: RouteStop[]): RoutePlan {
  const remaining = [...destinations];
  const visitOrder: string[] = [];
  const orderedStops: OrderedRouteStop[] = [createOriginStop(origin)];

  if (remaining.length === 0) {
    return {
      visitOrder,
      orderedStops,
      totalDistanceM: 0,
      totalDurationS: 0
    };
  }

  let current: RouteStop = origin;
  let cumulativeDistance = 0;
  let cumulativeDuration = 0;
  let sequence = 1;

  while (remaining.length > 0) {
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let idx = 0; idx < remaining.length; idx++) {
      const candidate = remaining[idx];
      const distance = haversineDistance(current, candidate);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = idx;
      }
    }

    const nextStop = remaining.splice(closestIndex, 1)[0]!;
    const legDurationSeconds = estimateDurationSeconds(closestDistance);
    cumulativeDistance += closestDistance;
    cumulativeDuration += legDurationSeconds;

    orderedStops.push({
      id: nextStop.id,
      label: nextStop.label,
      lat: nextStop.lat,
      lng: nextStop.lng,
      sequence,
      distanceFromPreviousM: roundToInt(closestDistance),
      durationFromPreviousS: roundToInt(legDurationSeconds),
      cumulativeDistanceM: roundToInt(cumulativeDistance),
      cumulativeDurationS: roundToInt(cumulativeDuration)
    });

    visitOrder.push(nextStop.id);
    current = nextStop;
    sequence += 1;
  }

  return {
    visitOrder,
    orderedStops,
    totalDistanceM: roundToInt(cumulativeDistance),
    totalDurationS: roundToInt(cumulativeDuration)
  };
}

export function createRouteGeoJson(plan: RoutePlan): RouteGeoJson {
  const orderedBySequence = [...plan.orderedStops].sort((a, b) => a.sequence - b.sequence);

  const coordinates: [number, number][] = orderedBySequence.map((stop) => [stop.lng, stop.lat]);
  if (coordinates.length === 1) {
    coordinates.push(coordinates[0]);
  }

  const pointFeatures: GeoJsonPointFeature[] = orderedBySequence.map((stop) => ({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [stop.lng, stop.lat]
    },
    properties: {
      id: stop.id,
      label: stop.label,
      sequence: stop.sequence,
      cumulativeDistanceM: stop.cumulativeDistanceM,
      cumulativeDurationS: stop.cumulativeDurationS
    }
  }));

  const lineFeature: GeoJsonLineFeature = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates
    },
    properties: {
      totalDistanceM: plan.totalDistanceM,
      totalDurationS: plan.totalDurationS
    }
  };

  return {
    type: 'FeatureCollection',
    features: [...pointFeatures, lineFeature]
  };
}
