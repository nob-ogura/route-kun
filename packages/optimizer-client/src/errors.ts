export type OptimizerClientErrorCode =
  | 'TIMEOUT'
  | 'HTTP_4XX'
  | 'HTTP_5XX'
  | 'NETWORK'
  | 'DECODE';

type ErrorOptions = {
  status?: number;
  cause?: unknown;
  attempt?: number;
  details?: unknown;
};

export class OptimizerClientError extends Error {
  readonly code: OptimizerClientErrorCode;
  readonly status?: number;
  readonly attempt?: number;
  readonly details?: unknown;

  constructor(message: string, code: OptimizerClientErrorCode, options: ErrorOptions = {}) {
    super(message);
    this.name = 'OptimizerClientError';
    this.code = code;
    this.status = options.status;
    this.attempt = options.attempt;
    this.details = options.details;

    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

export const isRetryableStatus = (status: number | undefined): boolean => {
  if (!status) {
    return false;
  }

  if (status >= 500) {
    return true;
  }

  return status === 429;
};
