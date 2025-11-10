import '@testing-library/jest-dom/vitest';

import { afterAll, afterEach, beforeAll } from 'vitest';

import { mockServer } from '@route-kun/msw/server';

beforeAll(() =>
  mockServer.listen({
    onUnhandledRequest: 'warn'
  })
);

afterEach(() => {
  mockServer.resetHandlers();
});

afterAll(() => {
  mockServer.close();
});
