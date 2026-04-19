import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DRIZZLE } from '../src/database/drizzle.provider';
import { db } from './setup';

describe('GET /docs — Integration (non-production)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    app = module.createNestApplication({ bufferLogs: true });

    const config = new DocumentBuilder()
      .setTitle('n-tier')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const document = cleanupOpenApiDoc(
      SwaggerModule.createDocument(app, config),
    );
    SwaggerModule.setup('docs', app, document);

    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 without authentication', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);
  });

  it('exposes the OpenAPI JSON at /docs-json', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(response.body.openapi).toBeDefined();
    expect(response.body.info.title).toBe('n-tier');
  });
});
