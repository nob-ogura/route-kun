import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: [path.resolve(__dirname, './vitest.setup.ts')],
    restoreMocks: true,
    globals: true,
    threads: false,
    fileParallelism: false
  }
});
