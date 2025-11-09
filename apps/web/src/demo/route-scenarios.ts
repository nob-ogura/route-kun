import type { RouteOptimizeResult } from '@route-kun/api';
import { createRouteGeoJson } from '@route-kun/domain';

type OrderedStop = RouteOptimizeResult['plan']['orderedStops'][number];

const baseStops: OrderedStop[] = [
  {
    id: 'origin',
    label: '東京駅',
    lat: 35.681236,
    lng: 139.767125,
    sequence: 0,
    distanceFromPreviousM: 0,
    durationFromPreviousS: 0,
    cumulativeDistanceM: 0,
    cumulativeDurationS: 0
  },
  {
    id: 'tokyo-tower',
    label: '東京タワー',
    lat: 35.65858,
    lng: 139.745433,
    sequence: 1,
    distanceFromPreviousM: 3200,
    durationFromPreviousS: 950,
    cumulativeDistanceM: 3200,
    cumulativeDurationS: 950
  },
  {
    id: 'sensoji',
    label: '浅草寺',
    lat: 35.714765,
    lng: 139.796655,
    sequence: 2,
    distanceFromPreviousM: 4200,
    durationFromPreviousS: 1250,
    cumulativeDistanceM: 7400,
    cumulativeDurationS: 2200
  },
  {
    id: 'skytree',
    label: '東京スカイツリー',
    lat: 35.710063,
    lng: 139.8107,
    sequence: 3,
    distanceFromPreviousM: 1300,
    durationFromPreviousS: 450,
    cumulativeDistanceM: 8700,
    cumulativeDurationS: 2650
  }
];

const createPlanFromStops = (routeId: string, stops: OrderedStop[]): RouteOptimizeResult['plan'] => {
  const orderedStops = [...stops].sort((a, b) => a.sequence - b.sequence);
  const visitOrder = orderedStops.filter((stop) => stop.sequence > 0).map((stop) => stop.id);
  const lastStop = orderedStops.at(-1);

  return {
    routeId,
    visitOrder,
    orderedStops,
    totalDistanceM: lastStop?.cumulativeDistanceM ?? 0,
    totalDurationS: lastStop?.cumulativeDurationS ?? 0
  };
};

const defaultDiagnostics = {
  strategy: 'quality',
  solver: 'or-tools',
  iterations: 3400,
  gap: 0.08,
  fallbackUsed: false,
  executionMs: 12876
} as const;

const scaleStops = (stops: OrderedStop[], options: { distanceFactor: number; durationFactor: number }) => {
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  let cumulativeDistance = 0;
  let cumulativeDuration = 0;

  return ordered.map((stop) => {
    if (stop.sequence === 0) {
      return { ...stop };
    }

    const scaledDistance = Math.max(1, Math.round(stop.distanceFromPreviousM * options.distanceFactor));
    const scaledDuration = Math.max(1, Math.round(stop.durationFromPreviousS * options.durationFactor));
    cumulativeDistance += scaledDistance;
    cumulativeDuration += scaledDuration;

    return {
      ...stop,
      distanceFromPreviousM: scaledDistance,
      durationFromPreviousS: scaledDuration,
      cumulativeDistanceM: cumulativeDistance,
      cumulativeDurationS: cumulativeDuration
    };
  });
};

type BuildDemoResultOptions = {
  routeId: string;
  stops: OrderedStop[];
  optimizerDiagnostics: RouteOptimizeResult['diagnostics']['optimizer'];
  fallbackUsed: boolean;
  fallbackReason?: RouteOptimizeResult['diagnostics']['fallbackReason'];
  optimizerErrorCode?: RouteOptimizeResult['diagnostics']['optimizerErrorCode'];
};

const buildDemoResult = (options: BuildDemoResultOptions): RouteOptimizeResult => {
  const plan = createPlanFromStops(options.routeId, options.stops);
  const geoJson = createRouteGeoJson({
    visitOrder: plan.visitOrder,
    orderedStops: plan.orderedStops,
    totalDistanceM: plan.totalDistanceM,
    totalDurationS: plan.totalDurationS
  });

  return {
    plan,
    geoJson,
    diagnostics: {
      optimizer: options.optimizerDiagnostics,
      fallbackUsed: options.fallbackUsed,
      fallbackReason: options.fallbackUsed ? options.fallbackReason ?? 'optimizer_gap_exceeded' : null,
      fallbackStrategy: options.fallbackUsed ? 'nearest_neighbor' : null,
      optimizerErrorCode: options.fallbackUsed ? options.optimizerErrorCode ?? null : null
    }
  };
};

const fallbackStops = scaleStops(baseStops, { distanceFactor: 1.18, durationFactor: 1.25 });

export const demoRouteResults = {
  success: buildDemoResult({
    routeId: 'demo-success-route',
    stops: baseStops,
    optimizerDiagnostics: { ...defaultDiagnostics },
    fallbackUsed: false
  }),
  fallback: buildDemoResult({
    routeId: 'demo-fallback-route',
    stops: fallbackStops,
    optimizerDiagnostics: null,
    fallbackUsed: true,
    fallbackReason: 'optimizer_error',
    optimizerErrorCode: 'TIMEOUT'
  })
} as const;

export type DemoRouteScenarioKey = keyof typeof demoRouteResults;

export const selectDemoScenario = (rawInput: string): RouteOptimizeResult => {
  const wantsFallback = rawInput.toLowerCase().includes('fallback');
  return wantsFallback ? demoRouteResults.fallback : demoRouteResults.success;
};
