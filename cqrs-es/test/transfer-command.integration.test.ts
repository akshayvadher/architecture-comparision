import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { asc, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/infrastructure/app.module';
import {
  accountReadModel,
  events,
} from '../src/infrastructure/persistence/schema';
import { db, TEST_DATABASE_URL } from './setup';

describe('Transfer Command via CQRS/ES — Integration (HTTP + real DB)', () => {
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

  async function initiateTransfer(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ) {
    return request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId, toAccountId, amount });
  }

  async function getAccount(accountId: string) {
    return request(app.getHttpServer()).get(`/accounts/${accountId}`);
  }

  async function getEventsForAggregate(aggregateId: string) {
    return db
      .select()
      .from(events)
      .where(eq(events.aggregateId, aggregateId))
      .orderBy(asc(events.version));
  }

  // --- AC 1: Initiate a transfer via POST /transfers ---

  it('initiates a transfer via POST /transfers and returns 201', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, 200);

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.fromAccountId).toBe(source.id);
    expect(response.body.toAccountId).toBe(destination.id);
    expect(response.body.amount).toBe(200);
  });

  // --- AC 2: Successful transfer appends TransferInitiated, AccountDebited, AccountCredited, TransferCompleted atomically ---

  it('appends TransferInitiated and TransferCompleted events on the transfer aggregate for a successful transfer', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, 200);
    const transferId = response.body.id;

    const transferEvents = await getEventsForAggregate(transferId);

    expect(transferEvents).toHaveLength(2);
    expect(transferEvents[0].eventType).toBe('TransferInitiated');
    expect(transferEvents[1].eventType).toBe('TransferCompleted');

    const initiatedData = transferEvents[0].eventData as {
      transferId: string;
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      timestamp: string;
    };
    expect(initiatedData.transferId).toBe(transferId);
    expect(initiatedData.fromAccountId).toBe(source.id);
    expect(initiatedData.toAccountId).toBe(destination.id);
    expect(initiatedData.amount).toBe(200);
    expect(initiatedData.timestamp).toBeDefined();

    const completedData = transferEvents[1].eventData as {
      transferId: string;
      timestamp: string;
    };
    expect(completedData.transferId).toBe(transferId);
    expect(completedData.timestamp).toBeDefined();
  });

  it('appends an AccountDebited event on the source account for a successful transfer', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, 200);
    const transferId = response.body.id;

    const sourceEvents = await getEventsForAggregate(source.id);

    // AccountCreated (from setup) + AccountDebited (from transfer)
    expect(sourceEvents).toHaveLength(2);
    expect(sourceEvents[1].eventType).toBe('AccountDebited');

    const debitedData = sourceEvents[1].eventData as {
      accountId: string;
      amount: number;
      transferId: string;
    };
    expect(debitedData.accountId).toBe(source.id);
    expect(debitedData.amount).toBe(200);
    expect(debitedData.transferId).toBe(transferId);
  });

  it('appends an AccountCredited event on the destination account for a successful transfer', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, 200);
    const transferId = response.body.id;

    const destEvents = await getEventsForAggregate(destination.id);

    // AccountCreated (from setup) + AccountCredited (from transfer)
    expect(destEvents).toHaveLength(2);
    expect(destEvents[1].eventType).toBe('AccountCredited');

    const creditedData = destEvents[1].eventData as {
      accountId: string;
      amount: number;
      transferId: string;
    };
    expect(creditedData.accountId).toBe(destination.id);
    expect(creditedData.amount).toBe(200);
    expect(creditedData.transferId).toBe(transferId);
  });

  // --- AC 3: Insufficient funds check uses replayed balance, not read model ---

  it('checks insufficient funds against the event-sourced balance, not the read model projection', async () => {
    const source = await createAccount('Alice', 500);
    const destination = await createAccount('Bob', 100);

    // Corrupt the read model to show a higher balance than reality
    await db
      .update(accountReadModel)
      .set({ balance: '999999' })
      .where(eq(accountReadModel.id, source.id));

    // The read model says 999999 but the event-sourced balance is 500.
    // A transfer of 700 should fail because the aggregate replays events and sees 500.
    const response = await initiateTransfer(source.id, destination.id, 700);

    expect(response.body.status).toBe('FAILED');
  });

  // --- AC 4: Failed transfer appends TransferInitiated + TransferFailed, no debit/credit events ---

  it('appends TransferInitiated and TransferFailed events when transfer fails for insufficient funds', async () => {
    const source = await createAccount('Alice', 100);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, 200);
    const transferId = response.body.id;

    const transferEvents = await getEventsForAggregate(transferId);

    expect(transferEvents).toHaveLength(2);
    expect(transferEvents[0].eventType).toBe('TransferInitiated');
    expect(transferEvents[1].eventType).toBe('TransferFailed');

    const failedData = transferEvents[1].eventData as {
      transferId: string;
      reason: string;
      timestamp: string;
    };
    expect(failedData.transferId).toBe(transferId);
    expect(failedData.reason).toBe('Insufficient funds');
    expect(failedData.timestamp).toBeDefined();
  });

  it('does not produce AccountDebited or AccountCredited events when a transfer fails', async () => {
    const source = await createAccount('Alice', 100);
    const destination = await createAccount('Bob', 500);

    await initiateTransfer(source.id, destination.id, 200);

    const sourceEvents = await getEventsForAggregate(source.id);
    const destEvents = await getEventsForAggregate(destination.id);

    // Source should only have AccountCreated — no AccountDebited
    expect(sourceEvents).toHaveLength(1);
    expect(sourceEvents[0].eventType).toBe('AccountCreated');

    // Destination should only have AccountCreated — no AccountCredited
    expect(destEvents).toHaveLength(1);
    expect(destEvents[0].eventType).toBe('AccountCreated');
  });

  // --- AC 5: Neither account's projected balance changes when a transfer fails ---

  it('does not change the source account projected balance when a transfer fails', async () => {
    const source = await createAccount('Alice', 100);
    const destination = await createAccount('Bob', 500);

    await initiateTransfer(source.id, destination.id, 200);

    const sourceResponse = await getAccount(source.id);
    expect(sourceResponse.body.balance).toBe(100);
  });

  it('does not change the destination account projected balance when a transfer fails', async () => {
    const source = await createAccount('Alice', 100);
    const destination = await createAccount('Bob', 500);

    await initiateTransfer(source.id, destination.id, 200);

    const destResponse = await getAccount(destination.id);
    expect(destResponse.body.balance).toBe(500);
  });

  // --- AC 6: Zero or negative amount is rejected with an error ---

  it('rejects a transfer with zero amount', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, 0);

    expect(response.status).toBe(400);
    expect(response.body.message).toBeDefined();
  });

  it('rejects a transfer with a negative amount', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, -50);

    expect(response.status).toBe(400);
    expect(response.body.message).toBeDefined();
  });

  it('does not append any events when a transfer with invalid amount is rejected', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    await initiateTransfer(source.id, destination.id, 0);

    // Only AccountCreated events should exist — no transfer events at all
    const sourceEvents = await getEventsForAggregate(source.id);
    const destEvents = await getEventsForAggregate(destination.id);

    expect(sourceEvents).toHaveLength(1);
    expect(sourceEvents[0].eventType).toBe('AccountCreated');
    expect(destEvents).toHaveLength(1);
    expect(destEvents[0].eventType).toBe('AccountCreated');
  });

  // --- AC 7: Transferring from a non-existent account returns not-found ---

  it('returns 404 when the source account does not exist', async () => {
    const destination = await createAccount('Bob', 500);
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await initiateTransfer(nonExistentId, destination.id, 100);

    expect(response.status).toBe(404);
    expect(response.body.message).toBeDefined();
  });

  // --- AC 8: Transferring to a non-existent account returns not-found ---

  it('returns 404 when the destination account does not exist', async () => {
    const source = await createAccount('Alice', 1000);
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await initiateTransfer(source.id, nonExistentId, 100);

    expect(response.status).toBe(404);
    expect(response.body.message).toBeDefined();
  });

  // --- AC 9: Transfer is atomic — all events appended in one transaction ---

  it('appends all four events for a successful transfer (verifying atomicity by event presence)', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, 300);
    const transferId = response.body.id;

    const transferEvents = await getEventsForAggregate(transferId);
    const sourceEvents = await getEventsForAggregate(source.id);
    const destEvents = await getEventsForAggregate(destination.id);

    // All four events should exist: TransferInitiated, AccountDebited, AccountCredited, TransferCompleted
    expect(transferEvents).toHaveLength(2);
    expect(transferEvents[0].eventType).toBe('TransferInitiated');
    expect(transferEvents[1].eventType).toBe('TransferCompleted');

    expect(sourceEvents).toHaveLength(2);
    expect(sourceEvents[1].eventType).toBe('AccountDebited');

    expect(destEvents).toHaveLength(2);
    expect(destEvents[1].eventType).toBe('AccountCredited');
  });

  it('updates projections in the same transaction — balances reflect the transfer immediately', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    await initiateTransfer(source.id, destination.id, 300);

    // Immediately query — projection should already be updated (synchronous, same transaction)
    const sourceResponse = await getAccount(source.id);
    const destResponse = await getAccount(destination.id);

    expect(sourceResponse.body.balance).toBe(700);
    expect(destResponse.body.balance).toBe(800);
  });

  // --- AC 10: Account read model reflects updated balances after successful transfer ---

  it('debits the source account balance in the read model after a successful transfer', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    await initiateTransfer(source.id, destination.id, 250);

    const sourceResponse = await getAccount(source.id);
    expect(sourceResponse.body.balance).toBe(750);
  });

  it('credits the destination account balance in the read model after a successful transfer', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    await initiateTransfer(source.id, destination.id, 250);

    const destResponse = await getAccount(destination.id);
    expect(destResponse.body.balance).toBe(750);
  });

  it('maintains correct balances after multiple successive transfers', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    await initiateTransfer(alice.id, bob.id, 200);
    await initiateTransfer(bob.id, alice.id, 100);
    await initiateTransfer(alice.id, bob.id, 50);

    const aliceResponse = await getAccount(alice.id);
    const bobResponse = await getAccount(bob.id);

    // Alice: 1000 - 200 + 100 - 50 = 850
    // Bob: 500 + 200 - 100 + 50 = 650
    expect(aliceResponse.body.balance).toBe(850);
    expect(bobResponse.body.balance).toBe(650);
  });

  // --- AC 11: Transfer response shape ---

  it('returns a completed transfer with id, source/destination references, amount, timestamp, and COMPLETED status', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, 200);

    expect(response.status).toBe(201);
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(response.body.fromAccountId).toBe(source.id);
    expect(response.body.toAccountId).toBe(destination.id);
    expect(response.body.amount).toBe(200);
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.status).toBe('COMPLETED');
  });

  it('returns a failed transfer with FAILED status when insufficient funds', async () => {
    const source = await createAccount('Alice', 50);
    const destination = await createAccount('Bob', 500);

    const response = await initiateTransfer(source.id, destination.id, 200);

    expect(response.status).toBe(201);
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(response.body.fromAccountId).toBe(source.id);
    expect(response.body.toAccountId).toBe(destination.id);
    expect(response.body.amount).toBe(200);
    expect(response.body.timestamp).toBeDefined();
    expect(response.body.status).toBe('FAILED');
  });

  // --- Edge case: transfer debits entire balance ---

  it('allows transferring the entire balance from source account', async () => {
    const source = await createAccount('Alice', 500);
    const destination = await createAccount('Bob', 100);

    const response = await initiateTransfer(source.id, destination.id, 500);

    expect(response.body.status).toBe('COMPLETED');

    const sourceResponse = await getAccount(source.id);
    expect(sourceResponse.body.balance).toBe(0);

    const destResponse = await getAccount(destination.id);
    expect(destResponse.body.balance).toBe(600);
  });
});
