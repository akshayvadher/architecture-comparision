import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/infrastructure/app.module';
import { TEST_DATABASE_URL } from '../setup';

describe('Money Transfer — Integration Tests (HTTP + real DB)', () => {
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

  async function createAccount(
    owner: string,
    balance: number,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner, balance })
      .expect(201);
    return response.body.id;
  }

  describe('successful transfer', () => {
    it('debits source and credits destination, returns COMPLETED transfer with events', async () => {
      const sourceId = await createAccount('Alice', 1000);
      const destId = await createAccount('Bob', 500);

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: sourceId, toAccountId: destId, amount: 300 })
        .expect(201);

      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(response.body.fromAccountId).toBe(sourceId);
      expect(response.body.toAccountId).toBe(destId);
      expect(response.body.amount).toBe(300);
      expect(response.body.status).toBe('COMPLETED');
      expect(response.body.timestamp).toBeDefined();

      // Verify events
      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0].type).toBe('TransferCompleted');
      expect(response.body.events[0].data).toEqual({
        transferId: response.body.id,
        fromAccountId: sourceId,
        toAccountId: destId,
        amount: 300,
      });
    });

    it('actually changes account balances in the database', async () => {
      const sourceId = await createAccount('Alice', 1000);
      const destId = await createAccount('Bob', 500);

      await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: sourceId, toAccountId: destId, amount: 400 })
        .expect(201);

      const sourceResponse = await request(app.getHttpServer())
        .get(`/accounts/${sourceId}`)
        .expect(200);
      expect(sourceResponse.body.balance).toBe(600);

      const destResponse = await request(app.getHttpServer())
        .get(`/accounts/${destId}`)
        .expect(200);
      expect(destResponse.body.balance).toBe(900);
    });
  });

  describe('insufficient funds rejection', () => {
    it('returns 400 and does not change either account balance', async () => {
      const sourceId = await createAccount('Alice', 100);
      const destId = await createAccount('Bob', 500);

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: sourceId, toAccountId: destId, amount: 500 })
        .expect(400);

      expect(response.body.message).toContain('Insufficient funds');

      // Verify neither balance changed
      const sourceResponse = await request(app.getHttpServer())
        .get(`/accounts/${sourceId}`)
        .expect(200);
      expect(sourceResponse.body.balance).toBe(100);

      const destResponse = await request(app.getHttpServer())
        .get(`/accounts/${destId}`)
        .expect(200);
      expect(destResponse.body.balance).toBe(500);
    });
  });

  describe('invalid amount rejection', () => {
    it('rejects a negative transfer amount with 400', async () => {
      const sourceId = await createAccount('Alice', 1000);
      const destId = await createAccount('Bob', 500);

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: sourceId, toAccountId: destId, amount: -50 })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('rejects a zero transfer amount with 400', async () => {
      const sourceId = await createAccount('Alice', 1000);
      const destId = await createAccount('Bob', 500);

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: sourceId, toAccountId: destId, amount: 0 })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('non-existent accounts', () => {
    it('returns 404 when source account does not exist', async () => {
      const destId = await createAccount('Bob', 500);
      const fakeId = '00000000-0000-0000-0000-000000000099';

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: fakeId, toAccountId: destId, amount: 100 })
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('returns 404 when destination account does not exist', async () => {
      const sourceId = await createAccount('Alice', 1000);
      const fakeId = '00000000-0000-0000-0000-000000000099';

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: sourceId, toAccountId: fakeId, amount: 100 })
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('transfer retrieval — GET /transfers/:id', () => {
    it('retrieves a completed transfer with all fields and TransferCompleted event', async () => {
      const sourceId = await createAccount('Alice', 1000);
      const destId = await createAccount('Bob', 500);

      const createResponse = await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: sourceId, toAccountId: destId, amount: 200 })
        .expect(201);

      const transferId = createResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/transfers/${transferId}`)
        .expect(200);

      expect(response.body.id).toBe(transferId);
      expect(response.body.fromAccountId).toBe(sourceId);
      expect(response.body.toAccountId).toBe(destId);
      expect(response.body.amount).toBe(200);
      expect(response.body.status).toBe('COMPLETED');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.events).toHaveLength(1);
      expect(response.body.events[0].type).toBe('TransferCompleted');
      expect(response.body.events[0].data).toEqual({
        transferId,
        fromAccountId: sourceId,
        toAccountId: destId,
        amount: 200,
      });
    });

    it('returns 404 for a non-existent transfer id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000099';

      const response = await request(app.getHttpServer())
        .get(`/transfers/${fakeId}`)
        .expect(404);

      expect(response.body.message).toContain('not found');
    });

    it('returns 400 for an invalid transfer id format', async () => {
      const response = await request(app.getHttpServer())
        .get('/transfers/not-a-uuid')
        .expect(400);

      expect(response.body.message).toContain('Invalid id');
    });

    it('retrieved transfer data matches what was returned at creation time', async () => {
      const sourceId = await createAccount('Alice', 1000);
      const destId = await createAccount('Bob', 500);

      const createResponse = await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: sourceId, toAccountId: destId, amount: 150 })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/transfers/${createResponse.body.id}`)
        .expect(200);

      expect(response.body.id).toBe(createResponse.body.id);
      expect(response.body.fromAccountId).toBe(
        createResponse.body.fromAccountId,
      );
      expect(response.body.toAccountId).toBe(createResponse.body.toAccountId);
      expect(response.body.amount).toBe(createResponse.body.amount);
      expect(response.body.status).toBe(createResponse.body.status);
      expect(response.body.events).toHaveLength(
        createResponse.body.events.length,
      );
      expect(response.body.events[0].type).toBe(
        createResponse.body.events[0].type,
      );
    });
  });

  describe('atomicity', () => {
    it('transfer is atomic — a failed transfer leaves both balances unchanged', async () => {
      const sourceId = await createAccount('Alice', 200);
      const destId = await createAccount('Bob', 300);

      // Attempt a transfer that will fail (insufficient funds)
      await request(app.getHttpServer())
        .post('/transfers')
        .send({ fromAccountId: sourceId, toAccountId: destId, amount: 500 })
        .expect(400);

      // Both balances unchanged
      const sourceResponse = await request(app.getHttpServer())
        .get(`/accounts/${sourceId}`)
        .expect(200);
      expect(sourceResponse.body.balance).toBe(200);

      const destResponse = await request(app.getHttpServer())
        .get(`/accounts/${destId}`)
        .expect(200);
      expect(destResponse.body.balance).toBe(300);
    });
  });
});
