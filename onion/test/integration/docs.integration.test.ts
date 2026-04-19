import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/infrastructure/app.module';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://onion:onion_local@localhost:5434/onion_bank_test';
process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT || '10000';

let app: INestApplication;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication({ bufferLogs: true });

  const config = new DocumentBuilder()
    .setTitle('onion')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  SwaggerModule.setup('docs', app, document);

  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('GET /docs — integration (non-production)', () => {
  it('returns 200 without authentication', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);
  });

  it('exposes the OpenAPI JSON at /docs-json', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(response.body.openapi).toBeDefined();
    expect(response.body.info.title).toBe('onion');
  });
});
