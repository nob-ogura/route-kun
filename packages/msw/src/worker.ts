import { setupWorker } from 'msw/browser';

import { defaultHandlers } from './handlers';

const isBrowserEnvironment =
  typeof globalThis.window !== 'undefined' && typeof globalThis.document !== 'undefined';

const createUnavailableWorker = () =>
  new Proxy({} as ReturnType<typeof setupWorker>, {
    get(_target, property) {
      throw new Error(
        `[MSW] Tried to access "mockWorker.${String(
          property
        )}" in a non-browser environment. Use "mockServer" instead.`
      );
    }
  });

export const mockWorker = isBrowserEnvironment
  ? setupWorker(...defaultHandlers)
  : createUnavailableWorker();
