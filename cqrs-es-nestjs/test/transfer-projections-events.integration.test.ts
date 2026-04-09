import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/infrastructure/app.module';
import { db, TEST_DATABASE_URL } from './setup';
import { transferReadModel } from '../src/infrastructure/persistence/schema';
import { eq } from 'drizzle-orm';

describe('Transfer Projections + Query Endpoints + Event Stream -- Integration (HTTP + real DB)', () => {
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
    const response = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId, toAccountId, amount })
      .expect(201);
    return response.body;
  }

  describe('transfer read model table structure (AC 1)', () => {
    it('transfer_read_model stores id, fromAccountId, toAccountId, amount, timestamp, and status', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      const transfer = await initiateTransfer(source.id, destination.id, 200);

      const rows = await db
        .select()
        .from(transferReadModel)
        .where(eq(transferReadModel.id, transfer.id));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.id).toBe(transfer.id);
      expect(row.fromAccountId).toBe(source.id);
      expect(row.toAccountId).toBe(destination.id);
      expect(Number(row.amount)).toBe(200);
      expect(row.timestamp).toBeDefined();
      expect(row.status).toBe('COMPLETED');
    });
  });

  describe('synchronous projection update (AC 2)', () => {
    it('transfer read model row exists immediately after POST /transfers returns', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      const transfer = await initiateTransfer(source.id, destination.id, 300);

      // No delay or polling needed -- projection is synchronous
      const rows = await db
        .select()
        .from(transferReadModel)
        .where(eq(transferReadModel.id, transfer.id));

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('COMPLETED');
    });

    it('failed transfer read model row exists immediately after POST /transfers returns', async () => {
      const source = await createAccount('Alice', 50);
      const destination = await createAccount('Bob', 500);

      const transfer = await initiateTransfer(source.id, destination.id, 200);

      const rows = await db
        .select()
        .from(transferReadModel)
        .where(eq(transferReadModel.id, transfer.id));

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAILED');
    });
  });

  describe('GET /transfers/:id (AC 3, AC 4)', () => {
    it('retrieves a transfer by id with all expected fields', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      const transfer = await initiateTransfer(source.id, destination.id, 250);

      const response = await request(app.getHttpServer())
        .get(`/transfers/${transfer.id}`)
        .expect(200);

      expect(response.body.id).toBe(transfer.id);
      expect(response.body.fromAccountId).toBe(source.id);
      expect(response.body.toAccountId).toBe(destination.id);
      expect(response.body.amount).toBe(250);
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.status).toBe('COMPLETED');
    });
  });

  describe('non-existent transfer returns 404 (AC 5)', () => {
    it('returns 404 for a transfer id that does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.getHttpServer())
        .get(`/transfers/${nonExistentId}`)
        .expect(404);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('invalid transfer id format returns 400 (AC 6)', () => {
    it('returns 400 for a non-UUID id', async () => {
      const response = await request(app.getHttpServer())
        .get('/transfers/not-a-uuid')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('returns 400 for a short numeric id', async () => {
      const response = await request(app.getHttpServer())
        .get('/transfers/123')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('completed transfer shows COMPLETED status (AC 7)', () => {
    it('GET /transfers/:id for a successful transfer returns status COMPLETED', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      const transfer = await initiateTransfer(source.id, destination.id, 100);

      const response = await request(app.getHttpServer())
        .get(`/transfers/${transfer.id}`)
        .expect(200);

      expect(response.body.status).toBe('COMPLETED');
    });
  });

  describe('failed transfer shows FAILED status (AC 8)', () => {
    it('GET /transfers/:id for an insufficient-funds transfer returns status FAILED', async () => {
      const source = await createAccount('Alice', 50);
      const destination = await createAccount('Bob', 500);

      const transfer = await initiateTransfer(source.id, destination.id, 200);
      expect(transfer.status).toBe('FAILED');

      const response = await request(app.getHttpServer())
        .get(`/transfers/${transfer.id}`)
        .expect(200);

      expect(response.body.status).toBe('FAILED');
      expect(response.body.fromAccountId).toBe(source.id);
      expect(response.body.toAccountId).toBe(destination.id);
      expect(response.body.amount).toBe(200);
    });
  });

  describe('GET /accounts/:id/events -- event stream (AC 9, AC 10)', () => {
    it('returns all events for an account ordered chronologically', async () => {
      const account = await createAccount('Alice', 1000);

      const response = await request(app.getHttpServer())
        .get(`/accounts/${account.id}/events`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].type).toBe('AccountCreated');
      expect(response.body[0].version).toBe(1);
    });

    it('events are returned in ascending version order', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      await initiateTransfer(source.id, destination.id, 200);

      const response = await request(app.getHttpServer())
        .get(`/accounts/${source.id}/events`)
        .expect(200);

      // Versions must be strictly ascending
      for (let i = 1; i < response.body.length; i++) {
        expect(response.body[i].version).toBeGreaterThan(
          response.body[i - 1].version,
        );
      }
    });
  });

  describe('full event history after create + transfers -- the aha moment (AC 11)', () => {
    it('shows AccountCreated, AccountDebited, and AccountCredited events in order after transfers', async () => {
      // Create Alice with 1000, Bob with 0
      const alice = await createAccount('Alice', 1000);
      const bob = await createAccount('Bob', 0);

      // Transfer 200 from Alice to Bob
      await initiateTransfer(alice.id, bob.id, 200);

      // Transfer 50 from Bob to Alice
      await initiateTransfer(bob.id, alice.id, 50);

      // Alice's event stream: AccountCreated, AccountDebited, AccountCredited
      const aliceEvents = await request(app.getHttpServer())
        .get(`/accounts/${alice.id}/events`)
        .expect(200);

      expect(aliceEvents.body).toHaveLength(3);
      expect(aliceEvents.body[0].type).toBe('AccountCreated');
      expect(aliceEvents.body[1].type).toBe('AccountDebited');
      expect(aliceEvents.body[2].type).toBe('AccountCredited');

      // Verify the event data tells the full story
      expect(aliceEvents.body[0].data.balance).toBe(1000);
      expect(aliceEvents.body[0].data.owner).toBe('Alice');
      expect(aliceEvents.body[1].data.amount).toBe(200);
      expect(aliceEvents.body[2].data.amount).toBe(50);

      // Bob's event stream: AccountCreated, AccountCredited, AccountDebited
      const bobEvents = await request(app.getHttpServer())
        .get(`/accounts/${bob.id}/events`)
        .expect(200);

      expect(bobEvents.body).toHaveLength(3);
      expect(bobEvents.body[0].type).toBe('AccountCreated');
      expect(bobEvents.body[1].type).toBe('AccountCredited');
      expect(bobEvents.body[2].type).toBe('AccountDebited');

      // The current balance (Alice=850, Bob=150) is nowhere in the event store
      // -- it is derived from the events. This is the "aha moment" of event sourcing.
      const aliceAccount = await request(app.getHttpServer())
        .get(`/accounts/${alice.id}`)
        .expect(200);
      expect(aliceAccount.body.balance).toBe(850);

      const bobAccount = await request(app.getHttpServer())
        .get(`/accounts/${bob.id}`)
        .expect(200);
      expect(bobAccount.body.balance).toBe(150);
    });
  });

  describe('each event includes type, data, version, and timestamp (AC 12)', () => {
    it('every event in the stream has all required fields', async () => {
      const source = await createAccount('Alice', 1000);
      const destination = await createAccount('Bob', 500);

      await initiateTransfer(source.id, destination.id, 200);

      const response = await request(app.getHttpServer())
        .get(`/accounts/${source.id}/events`)
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(2);

      for (const event of response.body) {
        expect(event.type).toEqual(expect.any(String));
        expect(event.data).toEqual(expect.any(Object));
        expect(event.version).toEqual(expect.any(Number));
        expect(event.timestamp).toEqual(expect.any(String));
      }

      // Verify specific event data shapes
      const createdEvent = response.body.find(
        (e: { type: string }) => e.type === 'AccountCreated',
      );
      expect(createdEvent.data.owner).toBe('Alice');
      expect(createdEvent.data.balance).toBe(1000);
      expect(createdEvent.version).toBe(1);

      const debitedEvent = response.body.find(
        (e: { type: string }) => e.type === 'AccountDebited',
      );
      expect(debitedEvent.data.amount).toBe(200);
      expect(debitedEvent.version).toBe(2);
    });
  });

  describe('non-existent account event stream returns 404 (AC 13)', () => {
    it('returns 404 for an account id with no events', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.getHttpServer())
        .get(`/accounts/${nonExistentId}/events`)
        .expect(404);

      expect(response.body.message).toBeDefined();
    });

    it('returns 400 for an invalid account id format on the events endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/not-a-uuid/events')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('failed transfer event stream records the attempt', () => {
    it('failed transfer does not add debit or credit events to account streams', async () => {
      const source = await createAccount('Alice', 50);
      const destination = await createAccount('Bob', 500);

      await initiateTransfer(source.id, destination.id, 200);

      // Source should only have AccountCreated -- no AccountDebited
      const sourceEvents = await request(app.getHttpServer())
        .get(`/accounts/${source.id}/events`)
        .expect(200);

      expect(sourceEvents.body).toHaveLength(1);
      expect(sourceEvents.body[0].type).toBe('AccountCreated');

      // Destination should only have AccountCreated -- no AccountCredited
      const destEvents = await request(app.getHttpServer())
        .get(`/accounts/${destination.id}/events`)
        .expect(200);

      expect(destEvents.body).toHaveLength(1);
      expect(destEvents.body[0].type).toBe('AccountCreated');
    });
  });
});
