import { Provider } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = NodePgDatabase<typeof schema>;

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  useFactory: async (): Promise<DrizzleDB> => {
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://clean:clean_local@localhost:5435/clean_bank',
    });
    return drizzle({ client: pool, schema });
  },
};
