import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from './accounts/accounts.module';
import { validateEnv } from './config/env.validate';
import { DatabaseModule } from './database/database.module';
import { TransfersModule } from './transfers/transfers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DatabaseModule,
    AccountsModule,
    TransfersModule,
  ],
})
export class AppModule {}
