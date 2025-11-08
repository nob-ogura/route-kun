import { http, HttpResponse, delay } from 'msw';

import {
  optimizerFallbackWireResponse,
  optimizerSuccessWireResponse
} from '../fixtures/optimizer';
import {
  buildOptimizerJsonResponse,
  validateOptimizerRequestBody
} from '../utils/optimizer-contract';

const OPTIMIZER_ENDPOINT = '*/optimize';

export const optimizerSuccessHandler = http.post(OPTIMIZER_ENDPOINT, async ({ request }) => {
  const violationResponse = await validateOptimizerRequestBody(request);
  if (violationResponse) {
    return violationResponse;
  }

  return buildOptimizerJsonResponse(optimizerSuccessWireResponse);
});

export const optimizerFallbackHandler = http.post(OPTIMIZER_ENDPOINT, async ({ request }) => {
  const violationResponse = await validateOptimizerRequestBody(request);
  if (violationResponse) {
    return violationResponse;
  }

  return buildOptimizerJsonResponse(optimizerFallbackWireResponse);
});

export const optimizerTimeoutHandler = http.post(OPTIMIZER_ENDPOINT, async ({ request }) => {
  const violationResponse = await validateOptimizerRequestBody(request);
  if (violationResponse) {
    return violationResponse;
  }

  await delay('infinite');

  return HttpResponse.json({ message: 'timeout' });
});

export const optimizerServerErrorHandler = http.post(OPTIMIZER_ENDPOINT, async ({ request }) => {
  const violationResponse = await validateOptimizerRequestBody(request);
  if (violationResponse) {
    return violationResponse;
  }

  return HttpResponse.json(
    {
      error: 'Optimizer is temporarily unavailable'
    },
    { status: 502 }
  );
});

export const optimizerHandlers = [optimizerSuccessHandler];
