import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { AccountService } from '../application/account.service';
import { TransferService } from '../application/transfer.service';
import { ACCOUNT_REPOSITORY } from '../domain/services/account-repository.interface';
import { TRANSFER_REPOSITORY } from '../domain/services/transfer-repository.interface';
import { UNIT_OF_WORK } from '../domain/services/unit-of-work.interface';
import type { Env } from './config/env.schema';
import { validateEnv } from './config/env.validate';
import { DrizzleAccountRepository } from './persistence/drizzle/account-repository';
import { drizzleProvider } from './persistence/drizzle/drizzle.provider';
import { DrizzleTransferRepository } from './persistence/drizzle/transfer-repository';
import { DrizzleUnitOfWork } from './persistence/drizzle/unit-of-work';
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
