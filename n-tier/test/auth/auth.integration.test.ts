import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/database/drizzle.provider';
import { db } from '../setup';

const ORIGINAL_ISSUER = process.env.OIDC_ISSUER;
const ORIGINAL_AUDIENCE = process.env.OIDC_AUDIENCE;

describe('JwtAuthGuard — integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.OIDC_ISSUER = 'https://issuer.test.invalid';
    process.env.OIDC_AUDIENCE = 'n-tier-bank-test';

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
