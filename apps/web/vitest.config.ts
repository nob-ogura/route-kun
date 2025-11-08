import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const resolveFromRoot = (relativePath: string) => path.resolve(__dirname, relativePath);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@route-kun/domain': resolveFromRoot('../../packages/domain/src')
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: [resolveFromRoot('./vitest.setup.ts')],
    include: ['app/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}'],
    globals: true
  }
});
