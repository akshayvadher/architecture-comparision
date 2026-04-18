import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { DrizzleAccountRepository } from '../adapters/driven/persistence/drizzle/account-repository.adapter';
import { drizzleProvider } from '../adapters/driven/persistence/drizzle/drizzle.provider';
import { DrizzleTransferRepository } from '../adapters/driven/persistence/drizzle/transfer-repository.adapter';
import { DrizzleUnitOfWork } from '../adapters/driven/persistence/drizzle/unit-of-work.adapter';
import { AccountController } from '../adapters/driving/rest/account.controller';
import { DomainErrorFilter } from '../adapters/driving/rest/error-filter';
import { TransferController } from '../adapters/driving/rest/transfer.controller';
import { AccountService } from '../application/account.service';
import { TransferService } from '../application/transfer.service';
import { ACCOUNT_REPOSITORY } from '../domain/ports/account-repository.port';
import { TRANSFER_REPOSITORY } from '../domain/ports/transfer-repository.port';
import { UNIT_OF_WORK } from '../domain/ports/unit-of-work.port';
import type { Env } from './config/env.schema';
import { validateEnv } from './config/env.validate';

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
    {
      provide: ACCOUNT_REPOSITORY,
      useClass: DrizzleAccountRepository,
    },
    {
      provide: TRANSFER_REPOSITORY,
      useClass: DrizzleTransferRepository,
    },
    {
      provide: UNIT_OF_WORK,
      useClass: DrizzleUnitOfWork,
    },
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
    AccountService,
    TransferService,
  ],
})
export class AppModule {}
