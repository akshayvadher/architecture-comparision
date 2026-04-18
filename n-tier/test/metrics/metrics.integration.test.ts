import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/database/drizzle.provider';
import { db } from '../setup';

describe('GET /metrics — Integration Tests', () => {
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
