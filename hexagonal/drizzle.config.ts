import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/adapters/driven/persistence/drizzle/migrations',
  schema: './src/adapters/driven/persistence/drizzle/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://hexagonal:hexagonal_local@localhost:5433/hexagonal_bank',
  },
});
