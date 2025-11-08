import type { OptimizerWireResponse } from '@route-kun/optimizer-client';
import {
  OptimizerWireRequestSchema,
  OptimizerWireResponseSchema
} from '@route-kun/optimizer-client';
import { HttpResponse } from 'msw';

export const validateOptimizerRequestBody = async (request: Request) => {
  const json = await request.json();
  const parsed = OptimizerWireRequestSchema.safeParse(json);

  if (!parsed.success) {
    return HttpResponse.json(
      {
        error: 'Optimizer wire request payload did not match contract',
        details: parsed.error.flatten()
      },
      { status: 422 }
    );
  }

  return undefined;
};

export const buildOptimizerJsonResponse = (payload: OptimizerWireResponse) => {
  const parsed = OptimizerWireResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new Error(`Optimizer wire response fixture is invalid: ${parsed.error.message}`);
  }

  return HttpResponse.json(parsed.data);
};
