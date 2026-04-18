import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AccountController } from '../interface-adapters/controllers/account.controller';
import { TransferController } from '../interface-adapters/controllers/transfer.controller';
import { DomainErrorFilter } from '../interface-adapters/error-filter';
import { CreateAccountUseCase } from '../use-cases/create-account/create-account.use-case';
import { ACCOUNT_GATEWAY } from '../use-cases/gateways/account.gateway';
import { TRANSFER_GATEWAY } from '../use-cases/gateways/transfer.gateway';
import { UNIT_OF_WORK } from '../use-cases/gateways/unit-of-work.gateway';
import { GetAccountUseCase } from '../use-cases/get-account/get-account.use-case';
import { GetTransferUseCase } from '../use-cases/get-transfer/get-transfer.use-case';
import { InitiateTransferUseCase } from '../use-cases/initiate-transfer/initiate-transfer.use-case';
import { ListAccountsUseCase } from '../use-cases/list-accounts/list-accounts.use-case';
import type { Env } from './config/env.schema';
import { validateEnv } from './config/env.validate';
import { HealthModule } from './health/health.module';
import { DrizzleAccountRepository } from './persistence/drizzle/account-repository';
import { DatabaseModule } from './persistence/drizzle/drizzle.provider';
import { DrizzleTransferRepository } from './persistence/drizzle/transfer-repository';
import { DrizzleUnitOfWork } from './persistence/drizzle/unit-of-work';

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
            customProps: () => ({ service: 'clean' }),
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const existing = req.headers['x-request-id'];
              const id =
                (Array.isArray(existing) ? existing[0] : existing) ??
                randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            customLogLevel: (
              _req: IncomingMessage,
              res: ServerResponse,
              err?: Error,
            ) => {
              if (res.statusCode >= 500 || err) {
                return 'error';
              }
              if (res.statusCode >= 400) {
                return 'warn';
              }
              return 'info';
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
      provide: ACCOUNT_GATEWAY,
      useClass: DrizzleAccountRepository,
    },
    {
      provide: TRANSFER_GATEWAY,
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
    CreateAccountUseCase,
    GetAccountUseCase,
    ListAccountsUseCase,
    InitiateTransferUseCase,
    GetTransferUseCase,
  ],
})
export class AppModule {}
