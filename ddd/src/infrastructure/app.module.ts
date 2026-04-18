import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AccountService } from '../application/account.service';
import { TransferService } from '../application/transfer.service';
import { ACCOUNT_REPOSITORY } from '../domain/repositories/account-repository.interface';
import { TRANSFER_REPOSITORY } from '../domain/repositories/transfer-repository.interface';
import { UNIT_OF_WORK } from '../domain/repositories/unit-of-work.interface';
import { AuthModule } from './auth/auth.module';
import type { Env } from './config/env.schema';
import { validateEnv } from './config/env.validate';
import { HealthModule } from './health/health.module';
import { DrizzleAccountRepository } from './persistence/drizzle/account-repository';
import { DatabaseModule } from './persistence/drizzle/drizzle.provider';
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
            customProps: () => ({ service: 'ddd' }),
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
    AuthModule,
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
