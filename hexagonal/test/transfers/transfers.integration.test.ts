import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/infrastructure/app.module';
import { TEST_DATABASE_URL } from '../setup';

describe('Transfer Execution — Integration Tests (HTTP + real DB)', () => {
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

  async function createAccount(owner: string, balance: number) {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner, balance })
      .expect(201);
    return response.body;
  }

  it('initiates a transfer via POST /transfers and returns the completed transfer', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 200 })
      .expect(201);

    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(response.body.fromAccountId).toBe(alice.id);
    expect(response.body.toAccountId).toBe(bob.id);
    expect(response.body.amount).toBe(200);
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.status).toBe('COMPLETED');
  });

  it('debits source and credits destination by the exact amount', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 300 })
      .expect(201);

    const aliceAfter = await request(app.getHttpServer())
      .get(`/accounts/${alice.id}`)
      .expect(200);
    const bobAfter = await request(app.getHttpServer())
      .get(`/accounts/${bob.id}`)
      .expect(200);

    expect(aliceAfter.body.balance).toBe(700);
    expect(bobAfter.body.balance).toBe(800);
  });

  it('rejects transfer with insufficient funds', async () => {
    const alice = await createAccount('Alice', 50);
    const bob = await createAccount('Bob', 500);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 100 })
      .expect(400);

    expect(response.body.message).toContain('Insufficient funds');
  });

  it('does not change balances when transfer is rejected for insufficient funds', async () => {
    const alice = await createAccount('Alice', 50);
    const bob = await createAccount('Bob', 500);

    await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 100 })
      .expect(400);

    const aliceAfter = await request(app.getHttpServer())
      .get(`/accounts/${alice.id}`)
      .expect(200);
    const bobAfter = await request(app.getHttpServer())
      .get(`/accounts/${bob.id}`)
      .expect(200);

    expect(aliceAfter.body.balance).toBe(50);
    expect(bobAfter.body.balance).toBe(500);
  });

  it('rejects zero amount transfer', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 0 })
      .expect(400);

    expect(response.body.message).toContain('greater than zero');
  });

  it('rejects negative amount transfer', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: -50 })
      .expect(400);

    expect(response.body.message).toContain('greater than zero');
  });

  it('returns not-found when source account does not exist', async () => {
    const bob = await createAccount('Bob', 500);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({
        fromAccountId: '99999999-9999-9999-9999-999999999999',
        toAccountId: bob.id,
        amount: 100,
      })
      .expect(404);

    expect(response.body.message).toContain('not found');
  });

  it('returns not-found when destination account does not exist', async () => {
    const alice = await createAccount('Alice', 1000);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({
        fromAccountId: alice.id,
        toAccountId: '99999999-9999-9999-9999-999999999999',
        amount: 100,
      })
      .expect(404);

    expect(response.body.message).toContain('not found');
  });
});

describe('Transfer Retrieval — Integration Tests (HTTP + real DB)', () => {
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

  async function createAccount(owner: string, balance: number) {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner, balance })
      .expect(201);
    return response.body;
  }

  async function createTransfer(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ) {
    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId, toAccountId, amount })
      .expect(201);
    return response.body;
  }

  it('retrieves a transfer by id via GET /transfers/:id', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);
    const transfer = await createTransfer(alice.id, bob.id, 200);

    const response = await request(app.getHttpServer())
      .get(`/transfers/${transfer.id}`)
      .expect(200);

    expect(response.body.id).toBe(transfer.id);
  });

  it('returns id, source account, destination account, amount, timestamp, and status', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);
    const transfer = await createTransfer(alice.id, bob.id, 350);

    const response = await request(app.getHttpServer())
      .get(`/transfers/${transfer.id}`)
      .expect(200);

    expect(response.body.id).toBe(transfer.id);
    expect(response.body.fromAccountId).toBe(alice.id);
    expect(response.body.toAccountId).toBe(bob.id);
    expect(response.body.amount).toBe(350);
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.status).toBe('COMPLETED');
  });

  it('returns 404 for a non-existent transfer id', async () => {
    const response = await request(app.getHttpServer())
      .get('/transfers/99999999-9999-9999-9999-999999999999')
      .expect(404);

    expect(response.body.message).toContain('Transfer with id');
    expect(response.body.message).toContain('not found');
  });

  it('returns 400 for an invalid transfer id format', async () => {
    const response = await request(app.getHttpServer())
      .get('/transfers/not-a-valid-uuid')
      .expect(400);

    expect(response.body.message).toContain('Invalid id format');
  });
});
