import { useState, type ReactNode } from 'react';

import type { RouteOptimizeResult } from '@route-kun/api';

type PendingMutation = {
  resolve: (value: RouteOptimizeResult | null) => void;
  reject: (error: Error) => void;
};

const pendingMutations: PendingMutation[] = [];

const dequeue = () => pendingMutations.shift();

export const routeOptimizeMutationController = {
  resolveNext(result: RouteOptimizeResult | null = null) {
    const pending = dequeue();
    pending?.resolve(result);
  },
  rejectNext(error: Error = new Error('Mock route.optimize mutation rejected')) {
    const pending = dequeue();
    pending?.reject(error);
  },
  reset() {
    while (pendingMutations.length > 0) {
      pendingMutations.shift()?.resolve(null);
    }
  },
  getPendingCount() {
    return pendingMutations.length;
  }
};

const useMockRouteOptimizeMutation = () => {
  const [isLoading, setIsLoading] = useState(false);

  const mutateAsync = async () =>
    new Promise<RouteOptimizeResult | null>((resolve, reject) => {
      setIsLoading(true);

      pendingMutations.push({
        resolve: (value) => {
          setIsLoading(false);
          resolve(value);
        },
        reject: (error) => {
          setIsLoading(false);
          reject(error);
        }
      });
    });

  const reset = () => {
    setIsLoading(false);
  };

  return {
    mutateAsync,
    isLoading,
    isPending: isLoading,
    reset,
    data: null,
    error: null
  };
};

export const trpc = {
  route: {
    optimize: {
      useMutation: useMockRouteOptimizeMutation
    }
  }
} as const;

export const TRPCProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
