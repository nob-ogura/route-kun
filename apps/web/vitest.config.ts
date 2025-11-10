import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const resolveFromRoot = (relativePath: string) => path.resolve(__dirname, relativePath);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@route-kun/domain': resolveFromRoot('../../packages/domain/src'),
      '@route-kun/api': resolveFromRoot('../../packages/api/src')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: [resolveFromRoot('./vitest.setup.ts')],
    include: ['app/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}'],
    globals: true,
    env: {
      NEXT_PUBLIC_MAPBOX_TOKEN: 'test-map-token',
      GOOGLE_MAPS_API_KEY: 'test-geocode-token',
      OPTIMIZER_SERVICE_URL: 'http://localhost:8001'
    }
  }
});
