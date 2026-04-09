import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/infrastructure/app.module';
import { DomainErrorFilter } from '../../src/infrastructure/rest/error-filter';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://onion:onion_local@localhost:5434/onion_bank_test';

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

  it('persists the account — creating then retrieving returns the same data', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Bob', balance: 250 })
      .expect(201);

    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${createResponse.body.id}`)
      .expect(200);

    expect(getResponse.body).toEqual(createResponse.body);
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
  it('retrieves an account by id with all expected fields', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 100 })
      .expect(201);

    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${createResponse.body.id}`)
      .expect(200);

    expect(getResponse.body).toEqual({
      id: createResponse.body.id,
      owner: 'Alice',
      balance: 100,
      status: 'ACTIVE',
    });
  });

  it('returns 404 for a non-existent account id', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts/00000000-0000-0000-0000-000000000000')
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

  it('returns all accounts when multiple exist', async () => {
    const alice = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 100 })
      .expect(201);

    const bob = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Bob', balance: 200 })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    expect(response.body).toHaveLength(2);
    expect(response.body).toEqual(
      expect.arrayContaining([alice.body, bob.body]),
    );
  });

  it('translates domain errors to HTTP responses without leaking HTTP concepts to inner layers', async () => {
    // AccountNotFoundError -> 404, InvalidIdError -> 400
    // These verify the error filter maps domain errors correctly
    const notFoundResponse = await request(app.getHttpServer())
      .get('/accounts/00000000-0000-0000-0000-000000000000')
      .expect(404);

    expect(notFoundResponse.body).toHaveProperty('statusCode', 404);
    expect(notFoundResponse.body).toHaveProperty('message');

    const badIdResponse = await request(app.getHttpServer())
      .get('/accounts/invalid-format')
      .expect(400);

    expect(badIdResponse.body).toHaveProperty('statusCode', 400);
    expect(badIdResponse.body).toHaveProperty('message');
  });
});
