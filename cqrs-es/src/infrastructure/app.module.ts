import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { CreateAccountHandler } from '../commands/create-account.handler';
import { InitiateTransferHandler } from '../commands/initiate-transfer.handler';
import { AccountProjector } from '../projections/account.projector';
import { TransferProjector } from '../projections/transfer.projector';
import { GetAccountHandler } from '../queries/get-account.handler';
import { GetAccountEventsHandler } from '../queries/get-account-events.handler';
import { GetTransferHandler } from '../queries/get-transfer.handler';
import { ListAccountsHandler } from '../queries/list-accounts.handler';
import type { Env } from './config/env.schema';
import { validateEnv } from './config/env.validate';
import { EventStore } from './event-store/event-store';
import { drizzleProvider } from './persistence/database';
import { AccountController } from './rest/account.controller';
import { DomainErrorFilter } from './rest/error-filter';
import { TransferController } from './rest/transfer.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => [
        {
          ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
          limit: config.get('THROTTLE_LIMIT', { infer: true }),
        },
      ],
    }),
  ],
  controllers: [AccountController, TransferController],
  providers: [
    drizzleProvider,
    EventStore,
    CreateAccountHandler,
    InitiateTransferHandler,
    AccountProjector,
    TransferProjector,
    GetAccountHandler,
    GetAccountEventsHandler,
    GetTransferHandler,
    ListAccountsHandler,
    {
      provide: APP_FILTER,
      useClass: DomainErrorFilter,
    },
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
