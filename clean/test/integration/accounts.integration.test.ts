import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/infrastructure/app.module';
import { DomainErrorFilter } from '../../src/interface-adapters/error-filter';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://clean:clean_local@localhost:5435/clean_bank_test';
process.env.THROTTLE_LIMIT = process.env.THROTTLE_LIMIT || '10000';

let app: INestApplication;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.useGlobalFilters(new DomainErrorFilter());
  await app.init();
});

afterAll(async () => {
  await app.close();
});

describe('POST /accounts — integration', () => {
  it('creates an account and returns id, owner, balance, ACTIVE status', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 100 })
      .expect(201);

    expect(response.body).toMatchObject({
      owner: 'Alice',
      balance: 100,
      status: 'ACTIVE',
    });
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('rejects negative initial balance with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: -50 })
      .expect(400);

    expect(response.body.message).toMatch(/negative/i);
  });

  it('rejects missing owner with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ balance: 100 })
      .expect(400);

    expect(response.body.message).toMatch(/owner/i);
  });

  it('rejects empty owner string with 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: '', balance: 100 })
      .expect(400);

    expect(response.body.message).toMatch(/owner/i);
  });
});

describe('GET /accounts/:id — integration', () => {
  it('retrieves a previously created account with id, owner, balance, and status', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 100 })
      .expect(201);

    const accountId = createResponse.body.id;

    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .expect(200);

    expect(getResponse.body).toMatchObject({
      id: accountId,
      owner: 'Alice',
      balance: 100,
      status: 'ACTIVE',
    });
  });

  it('returns 404 for a non-existent account id', async () => {
    const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

    const response = await request(app.getHttpServer())
      .get(`/accounts/${nonExistentId}`)
      .expect(404);

    expect(response.body.message).toMatch(/not found/i);
  });

  it('returns 400 for an invalid id format', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts/not-a-uuid')
      .expect(400);

    expect(response.body.message).toMatch(/invalid id/i);
  });
});

describe('GET /accounts — integration', () => {
  it('returns an empty array when no accounts exist', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('returns all created accounts', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 100 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Bob', balance: 200 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    expect(response.body).toHaveLength(2);
    const owners = response.body.map((a: any) => a.owner);
    expect(owners).toContain('Alice');
    expect(owners).toContain('Bob');
  });

  it('returns each account with id, owner, balance, and status', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Charlie', balance: 500 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    const account = response.body[0];
    expect(account).toHaveProperty('id');
    expect(account).toHaveProperty('owner', 'Charlie');
    expect(account).toHaveProperty('balance', 500);
    expect(account).toHaveProperty('status', 'ACTIVE');
  });
});
