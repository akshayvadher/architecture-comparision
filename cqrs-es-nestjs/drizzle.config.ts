import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/infrastructure/persistence/migrations',
  schema: './src/infrastructure/persistence/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://cqrs_es_nestjs:cqrs_es_nestjs_local@localhost:5439/cqrs_es_nestjs_bank',
  },
});
