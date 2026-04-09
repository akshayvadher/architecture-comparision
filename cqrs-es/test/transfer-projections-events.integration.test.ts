import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/infrastructure/app.module';
import { db, TEST_DATABASE_URL } from './setup';
import { transferReadModel } from '../src/infrastructure/persistence/schema';
import { eq } from 'drizzle-orm';

describe('Transfer Projections + Query Endpoint + Account Event Stream — Integration (HTTP + real DB)', () => {
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

  async function getTransfer(transferId: string) {
    return request(app.getHttpServer()).get(`/transfers/${transferId}`);
  }

  async function getAccountEvents(accountId: string) {
    return request(app.getHttpServer()).get(`/accounts/${accountId}/events`);
  }

  // =====================================================================
  // AC 1: Transfer read model table stores transfer state
  // =====================================================================

  it('stores transfer state in the read model table after a completed transfer', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(source.id, destination.id, 200);
    const transferId = transferResponse.body.id;

    const rows = await db
      .select()
      .from(transferReadModel)
      .where(eq(transferReadModel.id, transferId));

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(transferId);
    expect(rows[0].fromAccountId).toBe(source.id);
    expect(rows[0].toAccountId).toBe(destination.id);
    expect(Number(rows[0].amount)).toBe(200);
    expect(rows[0].timestamp).toBeDefined();
    expect(rows[0].status).toBe('COMPLETED');
  });

  it('stores transfer state in the read model table after a failed transfer', async () => {
    const source = await createAccount('Alice', 50);
    const destination = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(source.id, destination.id, 200);
    const transferId = transferResponse.body.id;

    const rows = await db
      .select()
      .from(transferReadModel)
      .where(eq(transferReadModel.id, transferId));

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(transferId);
    expect(rows[0].fromAccountId).toBe(source.id);
    expect(rows[0].toAccountId).toBe(destination.id);
    expect(Number(rows[0].amount)).toBe(200);
    expect(rows[0].status).toBe('FAILED');
  });

  // =====================================================================
  // AC 2: Projection updates synchronously when transfer events are appended
  // =====================================================================

  it('updates the transfer projection synchronously — transfer is queryable immediately after creation', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(source.id, destination.id, 300);
    const transferId = transferResponse.body.id;

    // Immediately query the transfer — projection should already be there
    const getResponse = await getTransfer(transferId);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(transferId);
    expect(getResponse.body.status).toBe('COMPLETED');
  });

  // =====================================================================
  // AC 3: Retrieve a transfer by id via GET /transfers/:id
  // =====================================================================

  it('retrieves a transfer by id via GET /transfers/:id', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(source.id, destination.id, 150);
    const transferId = transferResponse.body.id;

    const getResponse = await getTransfer(transferId);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(transferId);
  });

  // =====================================================================
  // AC 4: Response includes id, source account, destination account, amount, timestamp, and status
  // =====================================================================

  it('returns id, fromAccountId, toAccountId, amount, timestamp, and status in the GET /transfers/:id response', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(source.id, destination.id, 250);
    const transferId = transferResponse.body.id;

    const getResponse = await getTransfer(transferId);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toEqual({
      id: transferId,
      fromAccountId: source.id,
      toAccountId: destination.id,
      amount: 250,
      timestamp: expect.any(String),
      status: 'COMPLETED',
    });
  });

  it('returns amount as a number in GET /transfers/:id, not as a string', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(source.id, destination.id, 123);
    const transferId = transferResponse.body.id;

    const getResponse = await getTransfer(transferId);

    expect(typeof getResponse.body.amount).toBe('number');
  });

  // =====================================================================
  // AC 5: Non-existent transfer id returns not-found error
  // =====================================================================

  it('returns 404 when requesting a non-existent transfer id', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await getTransfer(nonExistentId);

    expect(response.status).toBe(404);
    expect(response.body.message).toBeDefined();
  });

  // =====================================================================
  // AC 6: Invalid id format returns an error
  // =====================================================================

  it('returns 400 when requesting a transfer with an invalid id format', async () => {
    const response = await getTransfer('not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.message).toBeDefined();
  });

  it('returns 400 when requesting a transfer with a numeric id instead of UUID', async () => {
    const response = await getTransfer('12345');

    expect(response.status).toBe(400);
    expect(response.body.message).toBeDefined();
  });

  // =====================================================================
  // AC 7: Completed transfer shows status of COMPLETED
  // =====================================================================

  it('shows status COMPLETED for a successful transfer queried via GET /transfers/:id', async () => {
    const source = await createAccount('Alice', 1000);
    const destination = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(source.id, destination.id, 200);
    const transferId = transferResponse.body.id;

    const getResponse = await getTransfer(transferId);

    expect(getResponse.body.status).toBe('COMPLETED');
  });

  // =====================================================================
  // AC 8: Failed transfer shows status of FAILED
  // =====================================================================

  it('shows status FAILED for a transfer that failed due to insufficient funds queried via GET /transfers/:id', async () => {
    const source = await createAccount('Alice', 50);
    const destination = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(source.id, destination.id, 200);
    const transferId = transferResponse.body.id;

    const getResponse = await getTransfer(transferId);

    expect(getResponse.body.status).toBe('FAILED');
  });

  // =====================================================================
  // AC 9: View full event history of an account via GET /accounts/:id/events
  // =====================================================================

  it('returns the event history of an account via GET /accounts/:id/events', async () => {
    const account = await createAccount('Alice', 1000);

    const response = await getAccountEvents(account.id);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThanOrEqual(1);
  });

  // =====================================================================
  // AC 10: Event stream returns all events ordered chronologically
  // =====================================================================

  it('returns events ordered chronologically by version number', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    // Perform two transfers involving Alice
    await initiateTransfer(alice.id, bob.id, 200);
    await initiateTransfer(bob.id, alice.id, 50);

    const response = await getAccountEvents(alice.id);

    expect(response.status).toBe(200);

    // Alice should have: AccountCreated (v1), AccountDebited (v2), AccountCredited (v3)
    expect(response.body).toHaveLength(3);

    // Verify ordering by version
    const versions = response.body.map((e: { version: number }) => e.version);
    expect(versions).toEqual([1, 2, 3]);
  });

  // =====================================================================
  // AC 11: After creating an account and performing transfers, the event stream
  // shows AccountCreated, AccountDebited, and AccountCredited events in order
  // =====================================================================

  it('shows AccountCreated, AccountDebited, and AccountCredited events in order after account creation and transfers', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    // Transfer out from Alice (debit)
    await initiateTransfer(alice.id, bob.id, 200);

    // Transfer in to Alice (credit)
    await initiateTransfer(bob.id, alice.id, 50);

    const response = await getAccountEvents(alice.id);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);

    expect(response.body[0].type).toBe('AccountCreated');
    expect(response.body[1].type).toBe('AccountDebited');
    expect(response.body[2].type).toBe('AccountCredited');
  });

  it('shows the complete event story for a heavily used account — the aha moment', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);
    const charlie = await createAccount('Charlie', 300);

    // Alice sends 200 to Bob
    await initiateTransfer(alice.id, bob.id, 200);
    // Charlie sends 50 to Alice
    await initiateTransfer(charlie.id, alice.id, 50);
    // Alice sends 100 to Charlie
    await initiateTransfer(alice.id, charlie.id, 100);

    const response = await getAccountEvents(alice.id);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);

    // AccountCreated -> AccountDebited (to Bob) -> AccountCredited (from Charlie) -> AccountDebited (to Charlie)
    expect(response.body[0].type).toBe('AccountCreated');
    expect(response.body[1].type).toBe('AccountDebited');
    expect(response.body[2].type).toBe('AccountCredited');
    expect(response.body[3].type).toBe('AccountDebited');

    // The event data tells the full story
    expect(response.body[0].data.balance).toBe(1000);
    expect(response.body[1].data.amount).toBe(200);
    expect(response.body[2].data.amount).toBe(50);
    expect(response.body[3].data.amount).toBe(100);
  });

  // =====================================================================
  // AC 12: Each event includes type, data, version, and timestamp
  // =====================================================================

  it('each event in the stream includes type, data, version, and timestamp', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    await initiateTransfer(alice.id, bob.id, 200);

    const response = await getAccountEvents(alice.id);

    for (const event of response.body) {
      expect(event.type).toBeDefined();
      expect(typeof event.type).toBe('string');
      expect(event.data).toBeDefined();
      expect(typeof event.data).toBe('object');
      expect(event.version).toBeDefined();
      expect(typeof event.version).toBe('number');
      expect(event.timestamp).toBeDefined();
      expect(typeof event.timestamp).toBe('string');
    }
  });

  it('AccountCreated event data includes owner and balance', async () => {
    const alice = await createAccount('Alice', 1000);

    const response = await getAccountEvents(alice.id);

    const createdEvent = response.body[0];
    expect(createdEvent.type).toBe('AccountCreated');
    expect(createdEvent.data.owner).toBe('Alice');
    expect(createdEvent.data.balance).toBe(1000);
    expect(createdEvent.version).toBe(1);
  });

  it('AccountDebited event data includes amount and transferId', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(alice.id, bob.id, 200);
    const transferId = transferResponse.body.id;

    const response = await getAccountEvents(alice.id);

    const debitedEvent = response.body[1];
    expect(debitedEvent.type).toBe('AccountDebited');
    expect(debitedEvent.data.amount).toBe(200);
    expect(debitedEvent.data.transferId).toBe(transferId);
    expect(debitedEvent.version).toBe(2);
  });

  it('AccountCredited event data includes amount and transferId', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(alice.id, bob.id, 200);
    const transferId = transferResponse.body.id;

    const response = await getAccountEvents(bob.id);

    const creditedEvent = response.body[1];
    expect(creditedEvent.type).toBe('AccountCredited');
    expect(creditedEvent.data.amount).toBe(200);
    expect(creditedEvent.data.transferId).toBe(transferId);
    expect(creditedEvent.version).toBe(2);
  });

  // =====================================================================
  // AC 13: Event stream endpoint returns not-found for a non-existent account id
  // =====================================================================

  it('returns 404 when requesting event stream for a non-existent account id', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await getAccountEvents(nonExistentId);

    expect(response.status).toBe(404);
    expect(response.body.message).toBeDefined();
  });

  it('returns 400 when requesting event stream with an invalid id format', async () => {
    const response = await getAccountEvents('not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.message).toBeDefined();
  });

  // =====================================================================
  // Edge: Event stream reads directly from the event store, not a projection
  // =====================================================================

  it('event stream reads from the event store — deleting the transfer read model does not affect account events', async () => {
    const alice = await createAccount('Alice', 1000);
    const bob = await createAccount('Bob', 500);

    const transferResponse = await initiateTransfer(alice.id, bob.id, 200);
    const transferId = transferResponse.body.id;

    // Delete the transfer read model row
    await db
      .delete(transferReadModel)
      .where(eq(transferReadModel.id, transferId));

    // The event stream should still work — it reads from the event store, not the projection
    const response = await getAccountEvents(alice.id);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body[0].type).toBe('AccountCreated');
    expect(response.body[1].type).toBe('AccountDebited');
  });

  // =====================================================================
  // Edge: Failed transfer does not appear in account event stream
  // =====================================================================

  it('a failed transfer does not add debit or credit events to the account event streams', async () => {
    const source = await createAccount('Alice', 50);
    const destination = await createAccount('Bob', 500);

    // This transfer will fail due to insufficient funds
    await initiateTransfer(source.id, destination.id, 200);

    const sourceEvents = await getAccountEvents(source.id);
    const destEvents = await getAccountEvents(destination.id);

    // Source should only have AccountCreated — no AccountDebited
    expect(sourceEvents.body).toHaveLength(1);
    expect(sourceEvents.body[0].type).toBe('AccountCreated');

    // Destination should only have AccountCreated — no AccountCredited
    expect(destEvents.body).toHaveLength(1);
    expect(destEvents.body[0].type).toBe('AccountCreated');
  });
});
