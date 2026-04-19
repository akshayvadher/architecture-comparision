import {
  Global,
  Injectable,
  Module,
  type OnModuleDestroy,
  type Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { Env } from '../config/env.schema';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = NodePgDatabase<typeof schema>;

@Injectable()
export class DatabaseConnection implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: DrizzleDB;

  constructor(configService: ConfigService<Env, true>) {
    const statementTimeoutMs = configService.get('DB_STATEMENT_TIMEOUT_MS', {
      infer: true,
    });
    this.pool = new Pool({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
      max: configService.get('DB_POOL_MAX', { infer: true }),
      idleTimeoutMillis: configService.get('DB_IDLE_TIMEOUT_MS', {
        infer: true,
      }),
      connectionTimeoutMillis: configService.get('DB_CONNECTION_TIMEOUT_MS', {
        infer: true,
      }),
      // Set statement_timeout as a backend startup option so it's active
      // before the client is returned by the pool — avoids racing a post-
      // connect `SET` query against the first real query.
      options: `-c statement_timeout=${statementTimeoutMs}`,
    });
    this.db = drizzle({ client: this.pool, schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  inject: [DatabaseConnection],
  useFactory: (connection: DatabaseConnection): DrizzleDB => connection.db,
};

@Global()
@Module({
  providers: [DatabaseConnection, drizzleProvider],
  exports: [DRIZZLE, DatabaseConnection],
})
export class DatabaseModule {}
