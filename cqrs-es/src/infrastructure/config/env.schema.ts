import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z.string().optional(),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(10_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
});

export type Env = z.infer<typeof envSchema>;
