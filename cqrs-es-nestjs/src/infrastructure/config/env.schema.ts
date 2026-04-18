import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;
