import {
  OptimizerRequest,
  OptimizerRequestSchema,
  OptimizerResponse,
  OptimizerResponseSchema,
  OptimizerWireResponseSchema
} from './schemas';
import { OptimizerClientError, OptimizerClientErrorCode, isRetryableStatus } from './errors';
import { fromWireResponse, toWireRequest } from './transformers';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

export const OPTIMIZER_CLIENT_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const OPTIMIZER_CLIENT_DEFAULT_RETRY_DELAYS_MS = DEFAULT_RETRY_DELAYS_MS.slice();

export interface OptimizerClientConfig {
  baseUrl: string;
  endpoint?: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelaysMs?: number[];
}

export interface OptimizerClient {
  optimize: (request: OptimizerRequest) => Promise<OptimizerResponse>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const classifyStatus = (status: number): OptimizerClientErrorCode => {
  if (status >= 500) {
    return 'HTTP_5XX';
  }

  return 'HTTP_4XX';
};

const createTimeoutController = (timeoutMs: number): { controller: AbortController; cancel: () => void } => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    cancel: () => clearTimeout(timeoutId)
  };
};

export const createOptimizerClient = (config: OptimizerClientConfig): OptimizerClient => {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;

  if (!fetchImpl) {
    throw new Error('A fetch implementation must be provided');
  }

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelays = config.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const endpoint = config.endpoint ?? '/optimize';
  const url = new URL(endpoint, config.baseUrl).toString();

  const performRequest = async (body: string): Promise<Response> => {
    let lastError: OptimizerClientError | undefined;

    for (let attemptIndex = 0; attemptIndex <= retryDelays.length; attemptIndex++) {
      const attemptNumber = attemptIndex + 1;
      const { controller, cancel } = createTimeoutController(timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...config.headers
          },
          body,
          signal: controller.signal
        });

        cancel();

        if (response.ok) {
          return response;
        }

        const status = response.status;
        const error = new OptimizerClientError(
          `Optimizer service returned HTTP ${status}`,
          classifyStatus(status),
          {
            status,
            attempt: attemptNumber
          }
        );

        if (isRetryableStatus(status) && attemptIndex < retryDelays.length) {
          lastError = error;
          await sleep(retryDelays[attemptIndex]);
          continue;
        }

        throw error;
      } catch (error) {
        cancel();
        const normalized = normalizeNetworkError(error, attemptNumber);

        if (shouldRetry(normalized, attemptIndex, retryDelays.length)) {
          lastError = normalized;
          await sleep(retryDelays[attemptIndex]);
          continue;
        }

        throw normalized;
      }
    }

    throw lastError ?? new OptimizerClientError('Optimizer request failed', 'NETWORK');
  };

  const optimize = async (request: OptimizerRequest): Promise<OptimizerResponse> => {
    const parsedRequest = OptimizerRequestSchema.parse(request);
    const body = JSON.stringify(toWireRequest(parsedRequest));
    const response = await performRequest(body);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new OptimizerClientError('Failed to parse Optimizer response JSON', 'DECODE', {
        cause: error
      });
    }

    const wireResponse = OptimizerWireResponseSchema.safeParse(payload);
    if (!wireResponse.success) {
      throw new OptimizerClientError('Optimizer response did not match the contract', 'DECODE', {
        details: wireResponse.error.flatten()
      });
    }

    const normalized = fromWireResponse(wireResponse.data);
    return OptimizerResponseSchema.parse(normalized);
  };

  return { optimize };
};

const normalizeNetworkError = (error: unknown, attempt: number): OptimizerClientError => {
  if (error instanceof OptimizerClientError) {
    return error;
  }

  if (isAbortError(error)) {
    return new OptimizerClientError('Optimizer request timed out', 'TIMEOUT', {
      cause: error,
      attempt
    });
  }

  return new OptimizerClientError('Optimizer network request failed', 'NETWORK', {
    cause: error,
    attempt
  });
};

const isAbortError = (error: unknown): boolean => {
  return error instanceof DOMException ? error.name === 'AbortError' : (error as Error | undefined)?.name === 'AbortError';
};

const shouldRetry = (error: OptimizerClientError, attemptIndex: number, maxIndex: number): boolean => {
  if (attemptIndex >= maxIndex) {
    return false;
  }

  if (error.code === 'TIMEOUT' || error.code === 'NETWORK') {
    return true;
  }

  if (error.code === 'HTTP_4XX') {
    return error.status === 429;
  }

  return error.code === 'HTTP_5XX';
};
