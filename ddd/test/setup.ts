import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import * as schema from '../src/infrastructure/persistence/drizzle/schema';
import * as path from 'path';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://ddd:ddd_local@localhost:5436/ddd_bank';

const pool = new Pool({ connectionString: TEST_DATABASE_URL });
const db = drizzle({ client: pool, schema });

beforeAll(async () => {
  try {
    await migrate(db, {
      migrationsFolder: path.resolve(
        __dirname,
        '../src/infrastructure/persistence/drizzle/migrations',
      ),
    });
  } catch (error: any) {
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
