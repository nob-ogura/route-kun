import type { OptimizerWireResponse } from '@route-kun/optimizer-client';
import { optimizerWireResponseFixture } from '@route-kun/optimizer-client';

export const optimizerSuccessWireResponse: OptimizerWireResponse = {
  ...optimizerWireResponseFixture
};

export const optimizerFallbackWireResponse: OptimizerWireResponse = {
  ...optimizerWireResponseFixture,
  route_id: 'bca0d841-c262-4d69-90df-49d26be0de1e',
  diagnostics: {
    ...optimizerWireResponseFixture.diagnostics,
    fallback_used: true,
    solver: 'nearest-neighbor',
    iterations: 0,
    gap: 0.24
  },
  total_distance_m: Math.round(optimizerWireResponseFixture.total_distance_m * 1.08),
  total_duration_s: Math.round(optimizerWireResponseFixture.total_duration_s * 1.15)
};
