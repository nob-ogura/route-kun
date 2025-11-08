import { describe, expect, it } from 'vitest';

import {
  optimizerRequestFixture,
  optimizerResponseFixture,
  optimizerWireRequestFixture,
  optimizerWireResponseFixture
} from './fixtures/optimizer-contract';
import {
  DistanceMatrixSchema,
  OptimizerRequestSchema,
  OptimizerResponseSchema,
  OptimizerWireRequestSchema,
  OptimizerWireResponseSchema
} from './schemas';

describe('Optimizer contract schemas', () => {
  it('accepts the canonical request fixture in camelCase form', () => {
    const result = OptimizerRequestSchema.safeParse(optimizerRequestFixture);

    expect(result.success).toBe(true);
  });

  it('rejects distance matrices with mismatched dimensions', () => {
    const invalidMatrix = {
      meters: [
        [0, 1, 2],
        [3, 4]
      ],
      seconds: [
        [0, 1, 2],
        [3, 4, 5]
      ]
    };

    const result = DistanceMatrixSchema.safeParse(invalidMatrix);

    expect(result.success).toBe(false);
  });

  it('accepts the camelCase response fixture', () => {
    const result = OptimizerResponseSchema.safeParse(optimizerResponseFixture);

    expect(result.success).toBe(true);
  });

  it('accepts snake_case wire fixtures and fails when required fields are missing', () => {
    expect(OptimizerWireRequestSchema.safeParse(optimizerWireRequestFixture).success).toBe(true);
    expect(OptimizerWireResponseSchema.safeParse(optimizerWireResponseFixture).success).toBe(true);

    const { route_id, ...rest } = optimizerWireResponseFixture;
    const missingFieldResult = OptimizerWireResponseSchema.safeParse(rest);

    expect(missingFieldResult.success).toBe(false);
  });
});
