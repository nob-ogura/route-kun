#!/usr/bin/env node

/**
 * Web app currently has no real code generation, but Turbo expects `generate`
 * to emit files under `src/**` or `types/**`.
 * This script writes a small placeholder under src/__generated__ so the task
 * stays cache-friendly and avoids noisy warnings.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const outDir = resolve(projectRoot, 'src/__generated__');
const outFile = resolve(outDir, 'placeholder.txt');

mkdirSync(outDir, { recursive: true });

const content = `// Generated placeholder for Turbo's generate task
// Safe to delete; will be recreated when running: pnpm --filter web generate
`;

writeFileSync(outFile, content, 'utf8');

// eslint-disable-next-line no-console
console.log(
  `[web:generate] wrote ${relative(projectRoot, outFile).replace(/\\/g, '/')}`
);
