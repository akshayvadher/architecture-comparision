import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/database/drizzle.provider';
import { ReadinessService } from '../../src/health/readiness.service';
import { db } from '../setup';

describe('Health Endpoints — Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    app = module.createNestApplication({ bufferLogs: true });
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /health/live', () => {
    it('returns 200 with status ok', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });

    it('propagates x-request-id on the response', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('echoes a client-provided x-request-id', async () => {
      const clientId = 'test-correlation-id-123';
      const response = await request(app.getHttpServer())
        .get('/health/live')
        .set('x-request-id', clientId)
        .expect(200);

      expect(response.headers['x-request-id']).toBe(clientId);
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 when the database is reachable', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        info: { database: { status: 'up' } },
      });
    });
  });

  describe('GET /health/ready — shutdown', () => {
    it('returns 503 on /health/ready once shutdown begins', async () => {
      const readiness = app.get(ReadinessService);
      readiness.beforeApplicationShutdown();

      const response = await request(app.getHttpServer()).get('/health/ready');

      expect(response.status).toBe(503);
    });
  });
});
