#!/usr/bin/env node
/**
 * Generate Supabase DB types into src/types/database.types.ts
 *
 * Strategy:
 * - If `supabase` CLI is available and DB URL is provided, use it to generate.
 * - Otherwise, write/update a stable stub so typecheck/build never break.
 * - Generated file is intended to be committed (Week 1 reproducibility).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const outDir = resolve(__dirname, '../src/types');
const outFile = resolve(outDir, 'database.types.ts');

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[supabase:types] ${msg}`);
}

function hasSupabaseCli() {
  const res = spawnSync('supabase', ['--version'], { encoding: 'utf8' });
  return res.status === 0;
}

function genWithCli(dbUrl) {
  const res = spawnSync(
    'supabase',
    ['gen', 'types', 'typescript', '--db-url', dbUrl],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim();
    throw new Error(stderr || 'supabase CLI failed');
  }
  return res.stdout;
}

function stubTypes() {
  return `// Auto-generated stub by generate-types.mjs (fallback)
// Replace by running: supabase gen types typescript --db-url $SUPABASE_DB_URL

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
}
`;
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(outDir);
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  let content = '';

  if (hasSupabaseCli() && dbUrl) {
    try {
      log('Generating types via supabase CLI...');
      content = genWithCli(dbUrl);
    } catch (e) {
      log(`CLI generation failed; writing stub. Reason: ${e.message}`);
      content = stubTypes();
    }
  } else {
    if (!hasSupabaseCli()) log('supabase CLI not found; writing stub.');
    if (!dbUrl) log('No DB URL provided; writing stub.');
    content = stubTypes();
  }

  writeFileSync(outFile, content, 'utf8');
  log(`Types written to ${outFile}`);
}

main();

