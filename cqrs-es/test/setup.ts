import * as path from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from '../src/infrastructure/persistence/schema';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://cqrs_es:cqrs_es_local@localhost:5438/cqrs_es_bank';

const pool = new Pool({ connectionString: TEST_DATABASE_URL });
const db = drizzle({ client: pool, schema });

beforeAll(async () => {
  try {
    await migrate(db, {
      migrationsFolder: path.resolve(
        __dirname,
        '../src/infrastructure/persistence/migrations',
      ),
    });
  } catch (error: any) {
    if (!error.message?.includes('duplicate key value')) {
      throw error;
    }
  }
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE events CASCADE`);
  await db.execute(sql`TRUNCATE TABLE account_read_model CASCADE`);
  await db.execute(sql`TRUNCATE TABLE transfer_read_model CASCADE`);
});

afterAll(async () => {
  await pool.end();
});

export { db, pool, TEST_DATABASE_URL };
