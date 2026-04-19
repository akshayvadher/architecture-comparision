import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive(),
    DATABASE_URL: z.string().url(),
    CORS_ORIGINS: z.string().optional(),
    THROTTLE_TTL_MS: z.coerce.number().int().positive().default(10_000),
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(100),
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_AUDIENCE: z.string().optional(),
    OIDC_JWKS_URI: z.string().url().optional(),
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_SERVICE_NAME: z.string().optional(),
    SNAPSHOT_EVERY_N_EVENTS: z.coerce.number().int().positive().default(10),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') {
      return;
    }
    if (!data.OIDC_ISSUER) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_ISSUER'],
        message: 'OIDC_ISSUER is required in production',
      });
    }
    if (!data.OIDC_AUDIENCE) {
      ctx.addIssue({
        code: 'custom',
        path: ['OIDC_AUDIENCE'],
        message: 'OIDC_AUDIENCE is required in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
