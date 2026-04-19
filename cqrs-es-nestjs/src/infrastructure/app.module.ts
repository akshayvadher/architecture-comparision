import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { CreateAccountHandler } from '../commands/create-account.handler';
import { InitiateTransferHandler } from '../commands/initiate-transfer.handler';
import { AccountProjector } from '../projections/account.projector';
import { TransferProjector } from '../projections/transfer.projector';
import { GetAccountHandler } from '../queries/get-account.handler';
import { GetAccountEventsHandler } from '../queries/get-account-events.handler';
import { GetTransferHandler } from '../queries/get-transfer.handler';
import { ListAccountsHandler } from '../queries/list-accounts.handler';
import { AuthModule } from './auth/auth.module';
import type { Env } from './config/env.schema';
import { validateEnv } from './config/env.validate';
import { EventStore } from './event-store/event-store';
import { HealthModule } from './health/health.module';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { MetricsModule } from './metrics/metrics.module';
import { OutboxPublisher } from './outbox/outbox-publisher.service';
import { DatabaseModule } from './persistence/database';
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
            customProps: () => ({ service: 'cqrs-es-nestjs' }),
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
          skipIf: (ctx) => {
            const req = ctx.switchToHttp().getRequest<{ url?: string }>();
            const url = req.url ?? '';
            return (
              url === '/metrics' ||
              url.startsWith('/metrics?') ||
              url === '/docs' ||
              url.startsWith('/docs/') ||
              url.startsWith('/docs?') ||
              url === '/docs-json' ||
              url.startsWith('/docs-json?')
            );
          },
        },
      ],
    }),
    CqrsModule.forRoot(),
    AuthModule,
    DatabaseModule,
    HealthModule,
    MetricsModule,
  ],
  controllers: [AccountController, TransferController],
  providers: [
    EventStore,
    CreateAccountHandler,
    InitiateTransferHandler,
    GetAccountHandler,
    ListAccountsHandler,
    GetTransferHandler,
    GetAccountEventsHandler,
    AccountProjector,
    TransferProjector,
    OutboxPublisher,
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
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
  ],
})
export class AppModule {}
