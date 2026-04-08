import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

  it('creates an account with zero balance', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Bob', balance: 0 })
      .expect(201);

    expect(response.body.balance).toBe(0);
    expect(response.body.status).toBe('ACTIVE');
  });

  it('rejects a negative initial balance with 400 status', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: -100 })
      .expect(400);

    expect(response.body.message).toBeDefined();
  });

  it('rejects a missing owner name with 400 status', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ balance: 100 })
      .expect(400);

    expect(response.body.message).toBeDefined();
  });

  it('rejects an empty owner name with 400 status', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: '', balance: 100 })
      .expect(400);

    expect(response.body.message).toBeDefined();
  });

  it('persists the account — the repository reconstitutes the aggregate with value objects', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Charlie', balance: 750 })
      .expect(201);

    const createdId = createResponse.body.id;

    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${createdId}`)
      .expect(200);

    expect(getResponse.body).toEqual({
      id: createdId,
      owner: 'Charlie',
      balance: 750,
      status: 'ACTIVE',
    });
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
    it('retrieves an account with id, owner, balance, and status', async () => {
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

      expect(response.body.message).toContain('not found');
    });

    it('returns 400 for an invalid id format', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/not-a-uuid')
        .expect(400);

      expect(response.body.message).toContain('Invalid id format');
    });

    it('reconstitutes the aggregate with value objects from persistence', async () => {
      const created = await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Bob', balance: 333.50 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/accounts/${created.body.id}`)
        .expect(200);

      expect(response.body.id).toBe(created.body.id);
      expect(response.body.owner).toBe('Bob');
      expect(response.body.balance).toBe(333.50);
      expect(response.body.status).toBe('ACTIVE');
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
        .send({ owner: 'Alice', balance: 1000 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Bob', balance: 500 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Charlie', balance: 0 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get('/accounts')
        .expect(200);

      expect(response.body).toHaveLength(3);

      const owners = response.body.map((a: any) => a.owner).sort();
      expect(owners).toEqual(['Alice', 'Bob', 'Charlie']);

      for (const account of response.body) {
        expect(account.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
        expect(account.status).toBe('ACTIVE');
        expect(typeof account.owner).toBe('string');
        expect(typeof account.balance).toBe('number');
      }
    });
  });

  describe('Domain error to HTTP translation', () => {
    it('translates AccountNotFoundError to 404 without leaking domain internals', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.statusCode).toBe(404);
      expect(response.body.message).toBeDefined();
    });

    it('translates InvalidIdError to 400 without leaking domain internals', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/garbage')
        .expect(400);

      expect(response.body.statusCode).toBe(400);
      expect(response.body.message).toBeDefined();
    });
  });
});
