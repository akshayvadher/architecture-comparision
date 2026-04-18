import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import type { Env } from './config/env.schema';

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService<Env, true>);

  app.use(json({ limit: '100kb' }));
  app.use(urlencoded({ extended: true, limit: '100kb' }));
  app.use(helmet());

  const corsOrigins = parseCorsOrigins(
    configService.get('CORS_ORIGINS', { infer: true }),
  );
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : false,
    credentials: true,
  });

  const port = configService.get('PORT', { infer: true });
  app.enableShutdownHooks();
  await app.listen(port);
}

process.on('unhandledRejection', (reason: unknown) => {
  const payload =
    reason instanceof Error
      ? {
          err: {
            name: reason.name,
            message: reason.message,
            stack: reason.stack,
          },
        }
      : { reason };
  console.error(
    JSON.stringify({ level: 'fatal', msg: 'unhandledRejection', ...payload }),
  );
  process.exit(1);
});

process.on('uncaughtException', (err: Error) => {
  console.error(
    JSON.stringify({
      level: 'fatal',
      msg: 'uncaughtException',
      err: { name: err.name, message: err.message, stack: err.stack },
    }),
  );
  process.exit(1);
});

bootstrap();
