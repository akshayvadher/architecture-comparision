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
        'postgresql://cqrs_es_nestjs:cqrs_es_nestjs_local@localhost:5439/cqrs_es_nestjs_bank',
    });
    return drizzle({ client: pool, schema });
  },
};
