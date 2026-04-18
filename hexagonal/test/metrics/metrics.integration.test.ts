import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/infrastructure/app.module';
import { TEST_DATABASE_URL } from '../setup';

describe('GET /metrics — Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

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
