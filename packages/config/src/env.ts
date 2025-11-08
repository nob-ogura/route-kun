import { z } from 'zod';

const requiredString = (name: string) =>
  z.string().min(1, `${name} must be set for Week 2`);

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_MAPBOX_TOKEN: requiredString("NEXT_PUBLIC_MAPBOX_TOKEN"),
  GOOGLE_MAPS_API_KEY: requiredString("GOOGLE_MAPS_API_KEY"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  OPTIMIZER_SERVICE_URL: z.string().url({ message: "OPTIMIZER_SERVICE_URL must be a valid URL" }),
  PLAYWRIGHT_TEST_BASE_URL: z.string().url().optional()
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
    throw new Error('Environment validation failed');
  }
  return parsed.data;
}
