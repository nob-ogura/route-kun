import type { ReactNode } from 'react';

import { render, screen } from '@testing-library/react';
import { describe, it, beforeEach, expect, vi } from 'vitest';

const {
  mockCreateClient,
  mockUseQuery,
  trpcProviderSpy,
  queryClientProviderSpy
} = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockUseQuery: vi.fn(),
  trpcProviderSpy: vi.fn(),
  queryClientProviderSpy: vi.fn()
}));

vi.mock('@trpc/react-query', () => {
  const trpcMock = {
    Provider: ({ children }: { children: ReactNode }) => {
      trpcProviderSpy();
      return <>{children}</>;
    },
    createClient: mockCreateClient,
    ping: {
      useQuery: mockUseQuery
    }
  };

  return {
    createTRPCReact: () => trpcMock
  };
});

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query'
  );

  return {
    ...actual,
    QueryClientProvider: ({ children }: { children: ReactNode }) => {
      queryClientProviderSpy();
      return <>{children}</>;
    }
  };
});

import { TRPCProvider, trpc } from '../src/lib/trpc';

const TestComponent = () => {
  const { data } = trpc.ping.useQuery();
  return <span>{data}</span>;
};

describe('layout providers', () => {
  beforeEach(() => {
    mockCreateClient.mockReset();
    mockUseQuery.mockReset();
    trpcProviderSpy.mockReset();
    queryClientProviderSpy.mockReset();

    mockCreateClient.mockReturnValue({});
    mockUseQuery.mockReturnValue({ data: 'pong' });
  });

  it('exposes tRPC hooks and only instantiates providers once', () => {
    render(
      <TRPCProvider>
        <TestComponent />
      </TRPCProvider>
    );

    expect(screen.getByText('pong')).toBeInTheDocument();
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(trpcProviderSpy).toHaveBeenCalledTimes(1);
    expect(queryClientProviderSpy).toHaveBeenCalledTimes(1);
  });
});
