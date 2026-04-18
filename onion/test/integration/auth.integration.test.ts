import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/infrastructure/app.module';
import { DomainErrorFilter } from '../../src/infrastructure/rest/error-filter';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://onion:onion_local@localhost:5434/onion_bank_test';
process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT || '10000';

const ORIGINAL_ISSUER = process.env.OIDC_ISSUER;
const ORIGINAL_AUDIENCE = process.env.OIDC_AUDIENCE;

let app: INestApplication;

beforeAll(async () => {
  process.env.OIDC_ISSUER = 'https://issuer.test.invalid';
  process.env.OIDC_AUDIENCE = 'onion-bank-test';

  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication({ bufferLogs: true });
  app.useGlobalFilters(new DomainErrorFilter());
  await app.init();
});

afterAll(async () => {
  await app.close();
  if (ORIGINAL_ISSUER === undefined) {
    delete process.env.OIDC_ISSUER;
  } else {
    process.env.OIDC_ISSUER = ORIGINAL_ISSUER;
  }
  if (ORIGINAL_AUDIENCE === undefined) {
    delete process.env.OIDC_AUDIENCE;
  } else {
    process.env.OIDC_AUDIENCE = ORIGINAL_AUDIENCE;
  }
});

describe('JwtAuthGuard — integration', () => {
  it('returns 401 on GET /accounts when no Authorization header is sent', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts')
      .expect(401);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBeDefined();
  });

  it('allows GET /health/live without a token (public endpoint)', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });
});
