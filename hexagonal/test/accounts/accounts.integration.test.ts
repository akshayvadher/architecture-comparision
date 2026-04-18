import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/infrastructure/app.module';
import { TEST_DATABASE_URL } from '../setup';

describe('Account Creation — Integration Tests (HTTP + real DB)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an account via POST /accounts and returns id, owner, balance, ACTIVE status', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 1000 })
      .expect(201);

    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(response.body.owner).toBe('Alice');
    expect(response.body.balance).toBe(1000);
    expect(response.body.status).toBe('ACTIVE');
  });

  it('persists the account — POST then GET returns the same data', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Bob', balance: 500 })
      .expect(201);

    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${createResponse.body.id}`)
      .expect(200);

    expect(getResponse.body).toEqual(createResponse.body);
  });

  it('rejects a negative initial balance with an error response', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: -100 })
      .expect(400);

    expect(response.body.error.message).toBeDefined();
    expect(response.body.error.code).toBeDefined();
  });

  it('rejects a missing owner name with an error response', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ balance: 100 })
      .expect(400);

    expect(response.body.error.message).toBeDefined();
    expect(response.body.error.code).toBeDefined();
    expect(response.body.error.requestId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('rejects an empty owner name with an error response', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: '', balance: 100 })
      .expect(400);

    expect(response.body.error.message).toBeDefined();
    expect(response.body.error.code).toBeDefined();
  });
});

describe('Account Retrieval — Integration Tests (HTTP + real DB)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /accounts/:id', () => {
    it('retrieves an account by id with id, owner, balance, and status', async () => {
      const created = await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Alice', balance: 1000 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/accounts/${created.body.id}`)
        .expect(200);

      expect(response.body).toEqual({
        id: created.body.id,
        owner: 'Alice',
        balance: 1000,
        status: 'ACTIVE',
      });
    });

    it('returns 404 for a non-existent account id', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.error.message).toBeDefined();
      expect(response.body.error.code).toBeDefined();
    });

    it('returns 400 for an invalid id format', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/not-a-uuid')
        .expect(400);

      expect(response.body.error.message).toBeDefined();
      expect(response.body.error.code).toBeDefined();
    });
  });

  describe('GET /accounts', () => {
    it('returns an empty array when no accounts exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('returns all accounts when multiple exist', async () => {
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

      for (const account of response.body) {
        expect(account.id).toBeDefined();
        expect(account.owner).toBeDefined();
        expect(account.balance).toBeDefined();
        expect(account.status).toBe('ACTIVE');
      }
    });
  });

  describe('error mapping — domain errors translated to HTTP status codes', () => {
    it('maps AccountNotFoundError to 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/00000000-0000-0000-0000-999999999999')
        .expect(404);

      expect(response.body.error.code).toBe('AccountNotFoundError');
      expect(response.body.error.message).toContain('not found');
    });

    it('maps InvalidIdError to 400', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/bad-id')
        .expect(400);

      expect(response.body.error.code).toBe('InvalidIdError');
      expect(response.body.error.message).toContain('Invalid id format');
    });
  });
});
