import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types/database.types';

export type TypedSupabaseClient = SupabaseClient<Database>;

export interface SupabaseClientConfig {
  url?: string;
  key?: string;
}

export function createSupabaseClient(config: SupabaseClientConfig = {}): TypedSupabaseClient {
  const url = config.url ?? process.env.SUPABASE_URL;
  const key = config.key ?? process.env.SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error('Missing SUPABASE_URL');
  }

  if (!key) {
    throw new Error('Missing Supabase API key');
  }

  return createClient<Database>(url, key);
}
