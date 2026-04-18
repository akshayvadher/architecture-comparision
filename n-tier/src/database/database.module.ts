import { Global, Module } from '@nestjs/common';
import {
  DatabaseConnection,
  DRIZZLE,
  drizzleProvider,
} from './drizzle.provider';

@Global()
@Module({
  providers: [DatabaseConnection, drizzleProvider],
  exports: [DRIZZLE, DatabaseConnection],
})
export class DatabaseModule {}
