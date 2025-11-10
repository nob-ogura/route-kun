'use client';

import { useState, type PropsWithChildren, type ReactElement } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@route-kun/api';
import superjson from 'superjson';

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return '';
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return `http://localhost:${process.env.PORT ?? 3000}`;
};

const generateRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
};

export const TRPCProvider = ({ children }: PropsWithChildren): ReactElement => {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error)
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          headers: () => ({
            'x-request-id': generateRequestId()
          })
        })
      ]
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
};
