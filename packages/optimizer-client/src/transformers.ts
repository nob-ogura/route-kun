import {
  DEFAULT_OPTIMIZER_OPTIONS,
  Diagnostics,
  OptimizerOptions,
  OptimizerRequest,
  OptimizerResponse,
  OptimizerWireDiagnostics,
  OptimizerWireOptions,
  OptimizerWireRequest,
  OptimizerWireResponse
} from './schemas';

const toWireOptions = (options: OptimizerOptions = DEFAULT_OPTIMIZER_OPTIONS): OptimizerWireOptions => ({
  strategy: options.strategy,
  max_iterations: options.maxIterations,
  max_runtime_seconds: options.maxRuntimeSeconds,
  fallback_tolerance: options.fallbackTolerance
});

export const toWireRequest = (request: OptimizerRequest): OptimizerWireRequest => ({
  origin: request.origin,
  destinations: request.destinations,
  distance_matrix: request.distanceMatrix,
  options: toWireOptions(request.options ?? DEFAULT_OPTIMIZER_OPTIONS)
});

const fromWireDiagnostics = (diagnostics: OptimizerWireDiagnostics): Diagnostics => ({
  strategy: diagnostics.strategy,
  solver: diagnostics.solver,
  iterations: diagnostics.iterations,
  gap: diagnostics.gap,
  fallbackUsed: diagnostics.fallback_used,
  executionMs: diagnostics.execution_ms
});

export const fromWireResponse = (response: OptimizerWireResponse): OptimizerResponse => ({
  routeId: response.route_id,
  visitOrder: response.visit_order,
  orderedStops: response.ordered_stops.map((stop) => ({
    id: stop.id,
    label: stop.label,
    lat: stop.lat,
    lng: stop.lng,
    sequence: stop.sequence,
    distanceFromPreviousM: stop.distance_from_previous_m,
    durationFromPreviousS: stop.duration_from_previous_s,
    cumulativeDistanceM: stop.cumulative_distance_m,
    cumulativeDurationS: stop.cumulative_duration_s
  })),
  totalDistanceM: response.total_distance_m,
  totalDurationS: response.total_duration_s,
  diagnostics: fromWireDiagnostics(response.diagnostics)
});
