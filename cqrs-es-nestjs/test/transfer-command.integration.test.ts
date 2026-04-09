import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/infrastructure/app.module';
import { db, TEST_DATABASE_URL } from './setup';
import {
  accountReadModel,
  events,
} from '../src/infrastructure/persistence/schema';
import { eq, asc, and } from 'drizzle-orm';

describe('Transfer Command + Business Rules via CommandBus -- Integration (HTTP + real DB)', () => {
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

  async function getAccount(id: string) {
    const response = await request(app.getHttpServer())
      .get(`/accounts/${id}`)
      .expect(200);
    return response.body;
  }

  async function getEventsForAggregate(aggregateId: string) {
    return db
      .select()
      .from(events)
      .where(eq(events.aggregateId, aggregateId))
      .orderBy(asc(events.version));
  }

  describe('successful transfer (AC 1, AC 2, AC 9, AC 10, AC 11)', () => {
    it('POST /transfers with source, destination, and amount returns 201 with transfer details and COMPLETED status', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 200,
        })
        .expect(201);

      expect(response.body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(response.body.fromAccountId).toBe(source.id);
      expect(response.body.toAccountId).toBe(destination.id);
      expect(response.body.amount).toBe(200);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.status).toBe('COMPLETED');
    });

    it('appends TransferInitiated, AccountDebited, AccountCredited, TransferCompleted events atomically', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      const transferResponse = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 300,
        })
        .expect(201);

      const transferId = transferResponse.body.id;

      // Check transfer aggregate events
      const transferEvents = await getEventsForAggregate(transferId);
      expect(transferEvents).toHaveLength(2);
      expect(transferEvents[0].eventType).toBe('TransferInitiated');
      expect(transferEvents[1].eventType).toBe('TransferCompleted');

      // Check source account events (AccountCreated + AccountDebited)
      const sourceEvents = await getEventsForAggregate(source.id);
      expect(sourceEvents).toHaveLength(2);
      expect(sourceEvents[0].eventType).toBe('AccountCreated');
      expect(sourceEvents[1].eventType).toBe('AccountDebited');

      const debitData = sourceEvents[1].eventData as {
        accountId: string;
        amount: number;
        transferId: string;
      };
      expect(debitData.accountId).toBe(source.id);
      expect(debitData.amount).toBe(300);
      expect(debitData.transferId).toBe(transferId);

      // Check destination account events (AccountCreated + AccountCredited)
      const destEvents = await getEventsForAggregate(destination.id);
      expect(destEvents).toHaveLength(2);
      expect(destEvents[0].eventType).toBe('AccountCreated');
      expect(destEvents[1].eventType).toBe('AccountCredited');

      const creditData = destEvents[1].eventData as {
        accountId: string;
        amount: number;
        transferId: string;
      };
      expect(creditData.accountId).toBe(destination.id);
      expect(creditData.amount).toBe(300);
      expect(creditData.transferId).toBe(transferId);
    });

    it('updates account read model balances after successful transfer', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 250,
        })
        .expect(201);

      const sourceAccount = await getAccount(source.id);
      expect(sourceAccount.balance).toBe(750);

      const destAccount = await getAccount(destination.id);
      expect(destAccount.balance).toBe(750);
    });
  });

  describe('insufficient funds check uses event-sourced balance, not read model (AC 3)', () => {
    it('rejects transfer when event-sourced balance is insufficient even if read model shows enough', async () => {
      const source = await createAccount('Alice', 100);
      const destination = await createAccount('Bob', 500);

      // Corrupt the read model to show a higher balance than reality
      await db
        .update(accountReadModel)
        .set({ balance: '999999' })
        .where(eq(accountReadModel.id, source.id));

      // Verify the read model was corrupted
      const corruptedRow = await db
        .select()
        .from(accountReadModel)
        .where(eq(accountReadModel.id, source.id));
      expect(Number(corruptedRow[0].balance)).toBe(999999);

      // Transfer 200 should fail because event-sourced balance is 100
      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 200,
        })
        .expect(201);

      expect(response.body.status).toBe('FAILED');
    });
  });

  describe('failed transfer due to insufficient funds (AC 4, AC 5)', () => {
    it('appends only TransferInitiated and TransferFailed events when funds are insufficient', async () => {
      const source = await createAccount('Alice', 100);
      const destination = await createAccount('Bob', 500);

      const transferResponse = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 200,
        })
        .expect(201);

      const transferId = transferResponse.body.id;

      // Transfer aggregate should have TransferInitiated + TransferFailed only
      const transferEvents = await getEventsForAggregate(transferId);
      expect(transferEvents).toHaveLength(2);
      expect(transferEvents[0].eventType).toBe('TransferInitiated');
      expect(transferEvents[1].eventType).toBe('TransferFailed');

      const failedData = transferEvents[1].eventData as {
        transferId: string;
        reason: string;
      };
      expect(failedData.reason).toBe('Insufficient funds');

      // Source account should have no AccountDebited event
      const sourceEvents = await getEventsForAggregate(source.id);
      expect(sourceEvents).toHaveLength(1);
      expect(sourceEvents[0].eventType).toBe('AccountCreated');

      // Destination account should have no AccountCredited event
      const destEvents = await getEventsForAggregate(destination.id);
      expect(destEvents).toHaveLength(1);
      expect(destEvents[0].eventType).toBe('AccountCreated');
    });

    it('does not change either account projected balance on failed transfer', async () => {
      const source = await createAccount('Alice', 100);
      const destination = await createAccount('Bob', 500);

      await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 200,
        })
        .expect(201);

      const sourceAccount = await getAccount(source.id);
      expect(sourceAccount.balance).toBe(100);

      const destAccount = await getAccount(destination.id);
      expect(destAccount.balance).toBe(500);
    });

    it('returns transfer with FAILED status for insufficient funds', async () => {
      const source = await createAccount('Alice', 50);
      const destination = await createAccount('Bob', 500);

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 100,
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.fromAccountId).toBe(source.id);
      expect(response.body.toAccountId).toBe(destination.id);
      expect(response.body.amount).toBe(100);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.status).toBe('FAILED');
    });
  });

  describe('zero and negative amount rejected (AC 6)', () => {
    it('rejects zero amount with 400 status', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 0,
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('rejects negative amount with 400 status', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: -50,
        })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('non-existent accounts return 404 (AC 7, AC 8)', () => {
    it('returns 404 when source account does not exist', async () => {
      const destination = await createAccount('Bob', 500);
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: nonExistentId,
          toAccountId: destination.id,
          amount: 100,
        })
        .expect(404);

      expect(response.body.message).toBeDefined();
    });

    it('returns 404 when destination account does not exist', async () => {
      const source = await createAccount('Alice', 1000);
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: nonExistentId,
          amount: 100,
        })
        .expect(404);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('atomicity of events (AC 9)', () => {
    it('all events for a successful transfer appear in the event store (no partial writes)', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      const transferResponse = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 150,
        })
        .expect(201);

      const transferId = transferResponse.body.id;

      // All four event types should be present across the three aggregates
      const allEvents = await db
        .select()
        .from(events)
        .where(
          eq(events.aggregateId, transferId),
        )
        .orderBy(asc(events.version));

      const transferEventTypes = allEvents.map((e) => e.eventType);
      expect(transferEventTypes).toContain('TransferInitiated');
      expect(transferEventTypes).toContain('TransferCompleted');

      const sourceEvents = await getEventsForAggregate(source.id);
      const sourceEventTypes = sourceEvents.map((e) => e.eventType);
      expect(sourceEventTypes).toContain('AccountDebited');

      const destEvents = await getEventsForAggregate(destination.id);
      const destEventTypes = destEvents.map((e) => e.eventType);
      expect(destEventTypes).toContain('AccountCredited');
    });
  });

  describe('multiple successive transfers update balances correctly', () => {
    it('two transfers from the same source correctly debit the balance twice', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 0);

      await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 300,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 200,
        })
        .expect(201);

      const sourceAccount = await getAccount(source.id);
      expect(sourceAccount.balance).toBe(500);

      const destAccount = await getAccount(destination.id);
      expect(destAccount.balance).toBe(500);
    });

    it('second transfer fails when first transfer exhausts the balance', async () => {
      const source = await createAccount('Alice', 500);
      const destination = await createAccount('Bob', 0);

      const first = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 500,
        })
        .expect(201);

      expect(first.body.status).toBe('COMPLETED');

      const second = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 1,
        })
        .expect(201);

      expect(second.body.status).toBe('FAILED');

      const sourceAccount = await getAccount(source.id);
      expect(sourceAccount.balance).toBe(0);
    });
  });

  describe('transfer debiting exact balance succeeds', () => {
    it('transfers the entire balance without error', async () => {
      const source = await createAccount('Alice', 500);
      const destination = await createAccount('Bob', 0);

      const response = await request(app.getHttpServer())
        .post('/transfers')
        .send({
          fromAccountId: source.id,
          toAccountId: destination.id,
          amount: 500,
        })
        .expect(201);

      expect(response.body.status).toBe('COMPLETED');

      const sourceAccount = await getAccount(source.id);
      expect(sourceAccount.balance).toBe(0);

      const destAccount = await getAccount(destination.id);
      expect(destAccount.balance).toBe(500);
    });
  });
});
