import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('GET /metrics — integration', () => {
  it('returns 200 without an Authorization header', async () => {
    await request(app.getHttpServer()).get('/metrics').expect(200);
  });

  it('exposes http request histogram and db pool gauges', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);

    const response = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(response.text).toContain('http_request_duration_seconds_bucket');
    expect(response.text).toContain('http_requests_total');
    expect(response.text).toContain('pg_pool_total_connections');
    expect(response.text).toContain('pg_pool_idle_connections');
    expect(response.text).toContain('pg_pool_waiting_clients');
  });
});
