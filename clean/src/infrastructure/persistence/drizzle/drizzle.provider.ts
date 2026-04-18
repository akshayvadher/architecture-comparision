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
import type { Env } from '../../config/env.schema';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

export type DrizzleDB = NodePgDatabase<typeof schema>;

@Injectable()
export class DatabaseConnection implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: DrizzleDB;

  constructor(configService: ConfigService<Env, true>) {
    this.pool = new Pool({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
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
