import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/database/drizzle.provider';
import { db } from '../setup';

describe('POST /accounts (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 201 with the created account for valid input', async () => {
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
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('returns 400 when owner name is missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ balance: 100 })
      .expect(400);

    expect(response.body.message).toContain('Owner name is required');
  });

  it('returns 400 when initial balance is negative', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Bob', balance: -50 })
      .expect(400);

    expect(response.body.message).toContain(
      'Initial balance cannot be negative',
    );
  });

  it('persists the account across requests', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Charlie', balance: 500 })
      .expect(201);

    const accountId = createResponse.body.id;

    // Verify persistence by querying the database directly
    const { AccountsRepository } = await import(
      '../../src/accounts/accounts.repository'
    );
    const repository = new AccountsRepository(db as any);
    const found = await repository.findById(accountId);

    expect(found).toBeDefined();
    expect(found?.owner).toBe('Charlie');
    expect(parseFloat(found?.balance)).toBe(500);
    expect(found?.status).toBe('ACTIVE');
  });
});

describe('GET /accounts/:id (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 with the account for a valid id', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 100 })
      .expect(201);

    const accountId = createResponse.body.id;

    const response = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .expect(200);

    expect(response.body).toEqual({
      id: accountId,
      owner: 'Alice',
      balance: 100,
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

    expect(response.body.message).toContain('Invalid account id format');
  });
});

describe('GET /accounts (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DRIZZLE)
      .useValue(db)
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns 200 with an empty array when no accounts exist', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('returns 200 with all accounts when multiple exist', async () => {
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

    const owners = response.body.map((a: any) => a.owner).sort();
    expect(owners).toEqual(['Alice', 'Bob']);

    for (const account of response.body) {
      expect(account).toHaveProperty('id');
      expect(account).toHaveProperty('owner');
      expect(account).toHaveProperty('balance');
      expect(account).toHaveProperty('status');
    }
  });
});
