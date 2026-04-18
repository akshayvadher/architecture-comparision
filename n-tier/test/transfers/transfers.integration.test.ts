import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { DRIZZLE } from '../../src/database/drizzle.provider';
import { db } from '../setup';

describe('POST /transfers (integration)', () => {
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

  async function createAccount(
    server: any,
    owner: string,
    balance: number,
  ): Promise<{ id: string; balance: number }> {
    const response = await request(server)
      .post('/accounts')
      .send({ owner, balance })
      .expect(201);
    return response.body;
  }

  it('returns 201 with a completed transfer for valid input', async () => {
    const server = app.getHttpServer();
    const source = await createAccount(server, 'Alice', 500);
    const destination = await createAccount(server, 'Bob', 200);

    const response = await request(server)
      .post('/transfers')
      .send({
        fromAccountId: source.id,
        toAccountId: destination.id,
        amount: 100,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      fromAccountId: source.id,
      toAccountId: destination.id,
      amount: 100,
      status: 'COMPLETED',
    });
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(response.body.timestamp).toBeDefined();
  });

  it('debits source and credits destination after a successful transfer', async () => {
    const server = app.getHttpServer();
    const source = await createAccount(server, 'Alice', 500);
    const destination = await createAccount(server, 'Bob', 200);

    await request(server)
      .post('/transfers')
      .send({
        fromAccountId: source.id,
        toAccountId: destination.id,
        amount: 150,
      })
      .expect(201);

    const sourceResponse = await request(server)
      .get(`/accounts/${source.id}`)
      .expect(200);
    const destResponse = await request(server)
      .get(`/accounts/${destination.id}`)
      .expect(200);

    expect(sourceResponse.body.balance).toBe(350);
    expect(destResponse.body.balance).toBe(350);
  });

  it('returns 400 with insufficient-funds error when balance is too low', async () => {
    const server = app.getHttpServer();
    const source = await createAccount(server, 'Alice', 100);
    const destination = await createAccount(server, 'Bob', 200);

    const response = await request(server)
      .post('/transfers')
      .send({
        fromAccountId: source.id,
        toAccountId: destination.id,
        amount: 150,
      })
      .expect(400);

    expect(response.body.error.message).toContain('Insufficient funds');
    expect(response.body.error.code).toBeDefined();
  });

  it('does not change balances when transfer is rejected for insufficient funds', async () => {
    const server = app.getHttpServer();
    const source = await createAccount(server, 'Alice', 100);
    const destination = await createAccount(server, 'Bob', 200);

    await request(server)
      .post('/transfers')
      .send({
        fromAccountId: source.id,
        toAccountId: destination.id,
        amount: 150,
      })
      .expect(400);

    const sourceResponse = await request(server)
      .get(`/accounts/${source.id}`)
      .expect(200);
    const destResponse = await request(server)
      .get(`/accounts/${destination.id}`)
      .expect(200);

    expect(sourceResponse.body.balance).toBe(100);
    expect(destResponse.body.balance).toBe(200);
  });

  it('returns 400 when transfer amount is zero', async () => {
    const server = app.getHttpServer();
    const source = await createAccount(server, 'Alice', 100);
    const destination = await createAccount(server, 'Bob', 200);

    const response = await request(server)
      .post('/transfers')
      .send({
        fromAccountId: source.id,
        toAccountId: destination.id,
        amount: 0,
      })
      .expect(400);

    expect(response.body.error.message).toContain('greater than zero');
    expect(response.body.error.code).toBeDefined();
  });

  it('returns 400 when transfer amount is negative', async () => {
    const server = app.getHttpServer();
    const source = await createAccount(server, 'Alice', 100);
    const destination = await createAccount(server, 'Bob', 200);

    const response = await request(server)
      .post('/transfers')
      .send({
        fromAccountId: source.id,
        toAccountId: destination.id,
        amount: -50,
      })
      .expect(400);

    expect(response.body.error.message).toContain('greater than zero');
    expect(response.body.error.code).toBeDefined();
  });

  it('returns 404 when source account does not exist', async () => {
    const server = app.getHttpServer();
    const destination = await createAccount(server, 'Bob', 200);

    const response = await request(server)
      .post('/transfers')
      .send({
        fromAccountId: '00000000-0000-0000-0000-000000000000',
        toAccountId: destination.id,
        amount: 50,
      })
      .expect(404);

    expect(response.body.error.message).toContain('Source account');
    expect(response.body.error.code).toBeDefined();
  });

  it('returns 404 when destination account does not exist', async () => {
    const server = app.getHttpServer();
    const source = await createAccount(server, 'Alice', 100);

    const response = await request(server)
      .post('/transfers')
      .send({
        fromAccountId: source.id,
        toAccountId: '00000000-0000-0000-0000-000000000000',
        amount: 50,
      })
      .expect(404);

    expect(response.body.error.message).toContain('Destination account');
    expect(response.body.error.code).toBeDefined();
  });
});

describe('GET /transfers/:id (integration)', () => {
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

  async function createAccount(
    server: any,
    owner: string,
    balance: number,
  ): Promise<{ id: string }> {
    const response = await request(server)
      .post('/accounts')
      .send({ owner, balance })
      .expect(201);
    return response.body;
  }

  async function createTransfer(
    server: any,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<{ id: string }> {
    const response = await request(server)
      .post('/transfers')
      .send({ fromAccountId, toAccountId, amount })
      .expect(201);
    return response.body;
  }

  it('returns 200 with the transfer for a valid id', async () => {
    const server = app.getHttpServer();
    const source = await createAccount(server, 'Alice', 500);
    const destination = await createAccount(server, 'Bob', 200);
    const transfer = await createTransfer(
      server,
      source.id,
      destination.id,
      100,
    );

    const response = await request(server)
      .get(`/transfers/${transfer.id}`)
      .expect(200);

    expect(response.body).toMatchObject({
      id: transfer.id,
      fromAccountId: source.id,
      toAccountId: destination.id,
      amount: 100,
      status: 'COMPLETED',
    });
    expect(response.body.timestamp).toBeDefined();
  });

  it('returns 404 for a non-existent transfer id', async () => {
    const server = app.getHttpServer();

    const response = await request(server)
      .get('/transfers/00000000-0000-0000-0000-000000000000')
      .expect(404);

    expect(response.body.error.message).toContain('not found');
    expect(response.body.error.code).toBeDefined();
  });

  it('returns 400 for an invalid transfer id format', async () => {
    const server = app.getHttpServer();

    const response = await request(server)
      .get('/transfers/not-a-uuid')
      .expect(400);

    expect(response.body.error.message).toContain('Invalid transfer id format');
    expect(response.body.error.code).toBeDefined();
  });
});
