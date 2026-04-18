import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from '../src/database/schema';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://ntier:ntier_local@localhost:5432/ntier_bank_test';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.PORT = process.env.PORT || '3000';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT || '10000';

const pool = new Pool({ connectionString: TEST_DATABASE_URL });
const db = drizzle({ client: pool, schema });

beforeAll(async () => {
  try {
    await migrate(db, {
      migrationsFolder: path.resolve(__dirname, '../src/database/migrations'),
    });
  } catch (error: any) {
    // Ignore "already exists" errors from concurrent migration runs
    if (!error.message?.includes('duplicate key value')) {
      throw error;
    }
  }
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE accounts CASCADE`);
});

afterAll(async () => {
  await pool.end();
});

export { db, pool, TEST_DATABASE_URL };
