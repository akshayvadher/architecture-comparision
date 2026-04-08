import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/infrastructure/persistence/drizzle/migrations',
  schema: './src/infrastructure/persistence/drizzle/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://clean:clean_local@localhost:5435/clean_bank',
  },
});
