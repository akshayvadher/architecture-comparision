import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/infrastructure/app.module';
import { DomainErrorFilter } from '../../src/interface-adapters/error-filter';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://clean:clean_local@localhost:5435/clean_bank_test';

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

async function createAccount(owner: string, balance: number): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/accounts')
    .send({ owner, balance })
    .expect(201);
  return response.body.id;
}

async function getAccountBalance(id: string): Promise<number> {
  const response = await request(app.getHttpServer())
    .get(`/accounts/${id}`)
    .expect(200);
  return response.body.balance;
}

describe('POST /transfers — integration', () => {
  it('completes a transfer and returns id, source, destination, amount, timestamp, COMPLETED status', async () => {
    const sourceId = await createAccount('Alice', 500);
    const destId = await createAccount('Bob', 200);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: sourceId, toAccountId: destId, amount: 100 })
      .expect(201);

    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(response.body.fromAccountId).toBe(sourceId);
    expect(response.body.toAccountId).toBe(destId);
    expect(response.body.amount).toBe(100);
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.timestamp).toBeDefined();
  });

  it('debits source and credits destination by exact amount', async () => {
    const sourceId = await createAccount('Alice', 500);
    const destId = await createAccount('Bob', 200);

    await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: sourceId, toAccountId: destId, amount: 150 })
      .expect(201);

    const sourceBalance = await getAccountBalance(sourceId);
    const destBalance = await getAccountBalance(destId);
    expect(sourceBalance).toBe(350);
    expect(destBalance).toBe(350);
  });

  it('rejects transfer with insufficient funds', async () => {
    const sourceId = await createAccount('Alice', 50);
    const destId = await createAccount('Bob', 200);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: sourceId, toAccountId: destId, amount: 100 })
      .expect(400);

    expect(response.body.message).toMatch(/insufficient/i);
  });

  it('does not change either balance when transfer is rejected for insufficient funds', async () => {
    const sourceId = await createAccount('Alice', 50);
    const destId = await createAccount('Bob', 200);

    await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: sourceId, toAccountId: destId, amount: 100 })
      .expect(400);

    const sourceBalance = await getAccountBalance(sourceId);
    const destBalance = await getAccountBalance(destId);
    expect(sourceBalance).toBe(50);
    expect(destBalance).toBe(200);
  });

  it('rejects zero amount with error', async () => {
    const sourceId = await createAccount('Alice', 500);
    const destId = await createAccount('Bob', 200);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: sourceId, toAccountId: destId, amount: 0 })
      .expect(400);

    expect(response.body.message).toMatch(/greater than zero/i);
  });

  it('rejects negative amount with error', async () => {
    const sourceId = await createAccount('Alice', 500);
    const destId = await createAccount('Bob', 200);

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: sourceId, toAccountId: destId, amount: -10 })
      .expect(400);

    expect(response.body.message).toMatch(/greater than zero/i);
  });

  it('returns not-found when source account does not exist', async () => {
    const destId = await createAccount('Bob', 200);
    const fakeSourceId = '550e8400-e29b-41d4-a716-446655440099';

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: fakeSourceId, toAccountId: destId, amount: 50 })
      .expect(404);

    expect(response.body.message).toMatch(/not found/i);
  });

  it('returns not-found when destination account does not exist', async () => {
    const sourceId = await createAccount('Alice', 500);
    const fakeDestId = '550e8400-e29b-41d4-a716-446655440099';

    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: sourceId, toAccountId: fakeDestId, amount: 50 })
      .expect(404);

    expect(response.body.message).toMatch(/not found/i);
  });

  it('is atomic — balances unchanged after a mid-transfer failure', async () => {
    const sourceId = await createAccount('Alice', 500);
    const destId = await createAccount('Bob', 200);

    // First, do a valid transfer to confirm wiring works
    await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: sourceId, toAccountId: destId, amount: 100 })
      .expect(201);

    // Now attempt a transfer that exceeds remaining balance
    await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: sourceId, toAccountId: destId, amount: 500 })
      .expect(400);

    // Balances should reflect only the first successful transfer
    const sourceBalance = await getAccountBalance(sourceId);
    const destBalance = await getAccountBalance(destId);
    expect(sourceBalance).toBe(400);
    expect(destBalance).toBe(300);
  });
});

async function createTransfer(
  fromAccountId: string,
  toAccountId: string,
  amount: number,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/transfers')
    .send({ fromAccountId, toAccountId, amount })
    .expect(201);
  return response.body.id;
}

describe('GET /transfers/:id — integration', () => {
  it('retrieves a completed transfer with all expected fields', async () => {
    const sourceId = await createAccount('Alice', 500);
    const destId = await createAccount('Bob', 200);
    const transferId = await createTransfer(sourceId, destId, 150);

    const response = await request(app.getHttpServer())
      .get(`/transfers/${transferId}`)
      .expect(200);

    expect(response.body.id).toBe(transferId);
    expect(response.body.fromAccountId).toBe(sourceId);
    expect(response.body.toAccountId).toBe(destId);
    expect(response.body.amount).toBe(150);
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.timestamp).toBeDefined();
  });

  it('returns not-found for a non-existent transfer id', async () => {
    const nonExistentId = '550e8400-e29b-41d4-a716-446655440099';

    const response = await request(app.getHttpServer())
      .get(`/transfers/${nonExistentId}`)
      .expect(404);

    expect(response.body.message).toMatch(/not found/i);
  });

  it('returns an error for an invalid id format', async () => {
    const response = await request(app.getHttpServer())
      .get('/transfers/not-a-uuid')
      .expect(400);

    expect(response.body.message).toMatch(/invalid id/i);
  });
});
