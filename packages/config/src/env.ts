import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_MAPBOX_TOKEN: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  OPTIMIZER_SERVICE_URL: z.string().url().optional(),
  PLAYWRIGHT_TEST_BASE_URL: z.string().url().optional()
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // In Week 1 we don't crash; log for visibility.
    // eslint-disable-next-line no-console
    console.warn('Invalid environment variables', parsed.error.flatten().fieldErrors);
  }
  return (parsed.success ? parsed.data : EnvSchema.parse({}));
}

