import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/infrastructure/app.module';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://ddd:ddd_local@localhost:5436/ddd_bank';
process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT || '10000';

let app: INestApplication;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication({ bufferLogs: true });
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health/live — integration', () => {
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

describe('GET /health/ready — integration', () => {
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
