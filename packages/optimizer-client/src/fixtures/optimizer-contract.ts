import {
  OptimizerRequest,
  OptimizerResponse,
  OptimizerWireRequest,
  OptimizerWireResponse
} from '../schemas';
import { fromWireResponse, toWireRequest } from '../transformers';

export const optimizerRequestFixture: OptimizerRequest = {
  origin: { lat: 35.681236, lng: 139.767125 },
  destinations: [
    { id: 'tokyo-tower', lat: 35.65858, lng: 139.745433, label: 'Tokyo Tower' },
    { id: 'sensoji', lat: 35.714765, lng: 139.796655, label: 'Sensoji Temple' },
    { id: 'skytree', lat: 35.710063, lng: 139.8107, label: 'Tokyo Skytree' }
  ],
  distanceMatrix: {
    meters: [
      [0, 3000, 5200, 5400],
      [3200, 0, 4100, 4300],
      [5000, 4200, 0, 1200],
      [5200, 4300, 1300, 0]
    ],
    seconds: [
      [0, 900, 1600, 1700],
      [950, 0, 1300, 1400],
      [1500, 1250, 0, 420],
      [1600, 1350, 450, 0]
    ]
  },
  options: {
    strategy: 'quality',
    maxIterations: 4_000,
    maxRuntimeSeconds: 30,
    fallbackTolerance: 0.15
  }
};

export const optimizerWireRequestFixture: OptimizerWireRequest = toWireRequest(optimizerRequestFixture);

export const optimizerWireResponseFixture: OptimizerWireResponse = {
  route_id: 'c0a80157-0c5d-4ac6-996a-5af68e3b4235',
  visit_order: ['tokyo-tower', 'sensoji', 'skytree'],
  ordered_stops: [
    {
      id: 'origin',
      label: 'Tokyo Station',
      lat: 35.681236,
      lng: 139.767125,
      sequence: 0,
      distance_from_previous_m: 0,
      duration_from_previous_s: 0,
      cumulative_distance_m: 0,
      cumulative_duration_s: 0
    },
    {
      id: 'tokyo-tower',
      label: 'Tokyo Tower',
      lat: 35.65858,
      lng: 139.745433,
      sequence: 1,
      distance_from_previous_m: 3200,
      duration_from_previous_s: 950,
      cumulative_distance_m: 3200,
      cumulative_duration_s: 950
    },
    {
      id: 'sensoji',
      label: 'Sensoji Temple',
      lat: 35.714765,
      lng: 139.796655,
      sequence: 2,
      distance_from_previous_m: 4200,
      duration_from_previous_s: 1250,
      cumulative_distance_m: 7400,
      cumulative_duration_s: 2200
    },
    {
      id: 'skytree',
      label: 'Tokyo Skytree',
      lat: 35.710063,
      lng: 139.8107,
      sequence: 3,
      distance_from_previous_m: 1300,
      duration_from_previous_s: 450,
      cumulative_distance_m: 8700,
      cumulative_duration_s: 2650
    }
  ],
  total_distance_m: 8700,
  total_duration_s: 2650,
  diagnostics: {
    strategy: 'quality',
    solver: 'or-tools',
    iterations: 3500,
    gap: 0.08,
    fallback_used: false,
    execution_ms: 12876
  }
};

export const optimizerResponseFixture: OptimizerResponse = fromWireResponse(optimizerWireResponseFixture);
