import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { DrizzleAccountRepository } from '../adapters/driven/persistence/drizzle/account-repository.adapter';
import { DatabaseModule } from '../adapters/driven/persistence/drizzle/drizzle.provider';
import { DrizzleTransferRepository } from '../adapters/driven/persistence/drizzle/transfer-repository.adapter';
import { DrizzleUnitOfWork } from '../adapters/driven/persistence/drizzle/unit-of-work.adapter';
import { AccountController } from '../adapters/driving/rest/account.controller';
import { DomainErrorFilter } from '../adapters/driving/rest/error-filter';
import { HealthModule } from '../adapters/driving/rest/health/health.module';
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
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const nodeEnv = config.get('NODE_ENV', { infer: true });
        const isProd = nodeEnv === 'production';
        const isTest = nodeEnv === 'test';
        const level = isTest ? 'silent' : isProd ? 'info' : 'debug';
        return {
          pinoHttp: {
            level,
            transport: isProd
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.token',
                'req.body.owner',
                'req.body.balance',
                'req.body.amount',
                'res.body.owner',
                'res.body.balance',
                'res.body.amount',
              ],
              censor: '[REDACTED]',
            },
            customProps: () => ({ service: 'hexagonal' }),
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const existing = req.headers['x-request-id'];
              const id =
                (Array.isArray(existing) ? existing[0] : existing) ??
                randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            autoLogging: {
              ignore: (req: IncomingMessage) =>
                req.url?.startsWith('/health') ?? false,
            },
          },
        };
      },
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
    DatabaseModule,
    HealthModule,
  ],
  controllers: [AccountController, TransferController],
  providers: [
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
