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

async function createAccount(owner: string, balance: number) {
  const response = await request(app.getHttpServer())
    .post('/accounts')
    .send({ owner, balance })
    .expect(201);
  return response.body;
}

describe('POST /transfers — integration', () => {
  it('initiates a transfer and returns all expected fields with COMPLETED status', async () => {
    const alice = await createAccount('Alice', 500);
    const bob = await createAccount('Bob', 200);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 150 })
      .expect(201);

    expect(response.body).toMatchObject({
      fromAccountId: alice.id,
      toAccountId: bob.id,
      amount: 150,
      status: 'COMPLETED',
    });
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(response.body.timestamp).toBeDefined();
  });

  it('debits source and credits destination by the transfer amount', async () => {
    const alice = await createAccount('Alice', 500);
    const bob = await createAccount('Bob', 200);

    await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 150 })
      .expect(201);

    const aliceAfter = await request(app.getHttpServer())
      .get(`/accounts/${alice.id}`)
      .expect(200);
    const bobAfter = await request(app.getHttpServer())
      .get(`/accounts/${bob.id}`)
      .expect(200);

    expect(aliceAfter.body.balance).toBe(350);
    expect(bobAfter.body.balance).toBe(350);
  });

  it('rejects insufficient funds with 400 and neither balance changes', async () => {
    const alice = await createAccount('Alice', 50);
    const bob = await createAccount('Bob', 200);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 100 })
      .expect(400);

    expect(response.body.message).toMatch(/insufficient funds/i);

    const aliceAfter = await request(app.getHttpServer())
      .get(`/accounts/${alice.id}`)
      .expect(200);
    const bobAfter = await request(app.getHttpServer())
      .get(`/accounts/${bob.id}`)
      .expect(200);

    expect(aliceAfter.body.balance).toBe(50);
    expect(bobAfter.body.balance).toBe(200);
  });

  it('rejects zero amount with 400', async () => {
    const alice = await createAccount('Alice', 500);
    const bob = await createAccount('Bob', 200);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 0 })
      .expect(400);

    expect(response.body.message).toMatch(/greater than zero/i);
  });

  it('rejects negative amount with 400', async () => {
    const alice = await createAccount('Alice', 500);
    const bob = await createAccount('Bob', 200);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: -50 })
      .expect(400);

    expect(response.body.message).toMatch(/greater than zero/i);
  });

  it('returns 404 when source account does not exist', async () => {
    const bob = await createAccount('Bob', 200);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({
        fromAccountId: '99999999-9999-9999-9999-999999999999',
        toAccountId: bob.id,
        amount: 100,
      })
      .expect(404);

    expect(response.body.message).toMatch(/not found/i);
  });

  it('returns 404 when destination account does not exist', async () => {
    const alice = await createAccount('Alice', 500);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({
        fromAccountId: alice.id,
        toAccountId: '99999999-9999-9999-9999-999999999999',
        amount: 100,
      })
      .expect(404);

    expect(response.body.message).toMatch(/not found/i);
  });

  it('transfer is atomic — multiple sequential transfers maintain correct balances', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 0);

    await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 200 })
      .expect(201);

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

    expect(aliceAfter.body.balance).toBe(500);
    expect(bobAfter.body.balance).toBe(500);
  });
});

describe('GET /transfers/:id — integration', () => {
  it('retrieves a transfer by id with all expected fields', async () => {
    const alice = await createAccount('Alice', 500);
    const bob = await createAccount('Bob', 200);

    const createResponse = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: alice.id, toAccountId: bob.id, amount: 100 })
      .expect(201);

    const getResponse = await request(app.getHttpServer())
      .get(`/transfers/${createResponse.body.id}`)
      .expect(200);

    expect(getResponse.body).toMatchObject({
      id: createResponse.body.id,
      fromAccountId: alice.id,
      toAccountId: bob.id,
      amount: 100,
      status: 'COMPLETED',
    });
    expect(getResponse.body.timestamp).toBeDefined();
  });

  it('returns 404 for a non-existent transfer id', async () => {
    const response = await request(app.getHttpServer())
      .get('/transfers/00000000-0000-0000-0000-000000000000')
      .expect(404);

    expect(response.body.message).toMatch(/not found/i);
  });

  it('returns 400 for an invalid transfer id format', async () => {
    const response = await request(app.getHttpServer())
      .get('/transfers/not-a-uuid')
      .expect(400);

    expect(response.body.message).toMatch(/invalid id/i);
  });
});
