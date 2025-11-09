import { TRPCError } from '@trpc/server';
import { randomUUID } from 'crypto';

/**
 * Generate a correlation ID for request tracking
 */
export const generateCorrelationId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return randomUUID();
};

/**
 * Extract correlation ID from headers or generate a new one
 */
export const getOrCreateCorrelationId = (headers?: Record<string, string | string[] | undefined>): string => {
  if (!headers) {
    return generateCorrelationId();
  }

  const requestId = headers['x-request-id'];
  if (typeof requestId === 'string' && requestId.length > 0) {
    return requestId;
  }

  if (Array.isArray(requestId) && requestId.length > 0 && requestId[0]) {
    return requestId[0];
  }

  return generateCorrelationId();
};

/**
 * Correlation context that extends tRPC context
 */
export type CorrelationContext = {
  correlationId: string;
  startTime: number;
};

/**
 * Create correlation context
 */
export const createCorrelationContext = (correlationId: string): CorrelationContext => ({
  correlationId,
  startTime: Date.now()
});

/**
 * Log request start
 */
export const logRequestStart = (path: string, correlationId: string): void => {
  console.log(`[${correlationId}] → ${path}`);
};

/**
 * Log request end
 */
export const logRequestEnd = (
  path: string,
  correlationId: string,
  startTime: number,
  error?: TRPCError
): void => {
  const duration = Date.now() - startTime;

  if (error) {
    console.error(`[${correlationId}] ← ${path} [${error.code}] ${duration}ms`, {
      message: error.message,
      code: error.code
    });
  } else {
    console.log(`[${correlationId}] ← ${path} [OK] ${duration}ms`);
  }
};

