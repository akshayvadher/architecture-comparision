import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/infrastructure/app.module';
import {
  accountReadModel,
  events,
} from '../src/infrastructure/persistence/schema';
import { AccountProjector } from '../src/projections/account.projector';
import { db, TEST_DATABASE_URL } from './setup';

describe('Account Projections + Query Endpoints via QueryBus -- Integration (HTTP + real DB)', () => {
  let app: INestApplication;
  let accountProjector: AccountProjector;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    accountProjector = moduleRef.get(AccountProjector);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('read model table structure (AC 1)', () => {
    it('account_read_model table stores id, owner, balance, and status', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Alice', balance: 1000 })
        .expect(201);

      const accountId = createResponse.body.id;

      const rows = await db
        .select()
        .from(accountReadModel)
        .where(eq(accountReadModel.id, accountId));

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.id).toBe(accountId);
      expect(row.owner).toBe('Alice');
      expect(Number(row.balance)).toBe(1000);
      expect(row.status).toBe('ACTIVE');
    });
  });

  describe('synchronous projection on AccountCreated (AC 2)', () => {
    it('read model row exists immediately after POST /accounts returns', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Bob', balance: 500 })
        .expect(201);

      const accountId = createResponse.body.id;

      // No delay or polling needed -- projection is synchronous
      const rows = await db
        .select()
        .from(accountReadModel)
        .where(eq(accountReadModel.id, accountId));

      expect(rows).toHaveLength(1);
      expect(rows[0].owner).toBe('Bob');
      expect(Number(rows[0].balance)).toBe(500);
    });
  });

  describe('GET /accounts/:id (AC 3, AC 4)', () => {
    it('retrieves an account by id with id, owner, balance, and status', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Charlie', balance: 750 })
        .expect(201);

      const accountId = createResponse.body.id;

      const getResponse = await request(app.getHttpServer())
        .get(`/accounts/${accountId}`)
        .expect(200);

      expect(getResponse.body.id).toBe(accountId);
      expect(getResponse.body.owner).toBe('Charlie');
      expect(getResponse.body.balance).toBe(750);
      expect(getResponse.body.status).toBe('ACTIVE');
    });
  });

  describe('non-existent account returns 404 (AC 5)', () => {
    it('returns 404 for an account id that does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.getHttpServer())
        .get(`/accounts/${nonExistentId}`)
        .expect(404);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('invalid id format returns 400 (AC 6)', () => {
    it('returns 400 for a non-UUID id', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/not-a-uuid')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });

    it('returns 400 for an empty id segment', async () => {
      const response = await request(app.getHttpServer())
        .get('/accounts/123')
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('GET /accounts -- list all accounts (AC 7)', () => {
    it('returns all created accounts', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Diana', balance: 100 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Eve', balance: 200 })
        .expect(201);

      const listResponse = await request(app.getHttpServer())
        .get('/accounts')
        .expect(200);

      expect(Array.isArray(listResponse.body)).toBe(true);
      expect(listResponse.body.length).toBeGreaterThanOrEqual(2);

      const owners = listResponse.body.map((a: { owner: string }) => a.owner);
      expect(owners).toContain('Diana');
      expect(owners).toContain('Eve');
    });
  });

  describe('empty collection when no accounts (AC 8)', () => {
    it('returns an empty array when no accounts exist', async () => {
      // beforeEach in setup.ts truncates all tables, so this test starts clean
      const response = await request(app.getHttpServer())
        .get('/accounts')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('multiple accounts all returned (AC 9)', () => {
    it('returns all three accounts after creating them', async () => {
      const names = ['Frank', 'Grace', 'Heidi'];

      for (const name of names) {
        await request(app.getHttpServer())
          .post('/accounts')
          .send({ owner: name, balance: 300 })
          .expect(201);
      }

      const listResponse = await request(app.getHttpServer())
        .get('/accounts')
        .expect(200);

      expect(listResponse.body).toHaveLength(3);

      const returnedOwners = listResponse.body.map(
        (a: { owner: string }) => a.owner,
      );
      for (const name of names) {
        expect(returnedOwners).toContain(name);
      }
    });
  });

  describe('GET reads from projection, not event store (AC 10)', () => {
    it('returns 404 after deleting the read model row even though events remain', async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Ivan', balance: 900 })
        .expect(201);

      const accountId = createResponse.body.id;

      // Confirm the account is retrievable
      await request(app.getHttpServer())
        .get(`/accounts/${accountId}`)
        .expect(200);

      // Delete the read model row directly, leaving the event store intact
      await db
        .delete(accountReadModel)
        .where(eq(accountReadModel.id, accountId));

      // Verify events still exist in the event store
      const storedEvents = await db
        .select()
        .from(events)
        .where(eq(events.aggregateId, accountId));
      expect(storedEvents.length).toBeGreaterThan(0);

      // GET should return 404 because the query reads from the projection table
      await request(app.getHttpServer())
        .get(`/accounts/${accountId}`)
        .expect(404);
    });
  });

  describe('query handlers separate from command handlers (AC 11)', () => {
    it('GET endpoint works independently from the POST command path', async () => {
      // Create via command side
      const createResponse = await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Judy', balance: 400 })
        .expect(201);

      // Query via the read side -- different handler, different data access path
      const getResponse = await request(app.getHttpServer())
        .get(`/accounts/${createResponse.body.id}`)
        .expect(200);

      // The query handler reads from accountReadModel, not from the event store
      expect(getResponse.body.owner).toBe('Judy');
      expect(getResponse.body.balance).toBe(400);
    });

    it('list endpoint works independently from the POST command path', async () => {
      await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Karl', balance: 600 })
        .expect(201);

      const listResponse = await request(app.getHttpServer())
        .get('/accounts')
        .expect(200);

      expect(listResponse.body.length).toBeGreaterThanOrEqual(1);
      const owners = listResponse.body.map((a: { owner: string }) => a.owner);
      expect(owners).toContain('Karl');
    });
  });

  describe('projection rebuildable from scratch (AC 12)', () => {
    it('restores read model data after truncation by replaying all events', async () => {
      // Create two accounts
      const alice = await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Alice-Rebuild', balance: 1000 })
        .expect(201);

      const bob = await request(app.getHttpServer())
        .post('/accounts')
        .send({ owner: 'Bob-Rebuild', balance: 2000 })
        .expect(201);

      // Verify both exist in read model
      await request(app.getHttpServer())
        .get(`/accounts/${alice.body.id}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/accounts/${bob.body.id}`)
        .expect(200);

      // Wipe the read model completely
      await db.delete(accountReadModel);

      // Verify both are gone
      await request(app.getHttpServer())
        .get(`/accounts/${alice.body.id}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/accounts/${bob.body.id}`)
        .expect(404);

      // Rebuild projections from events
      await accountProjector.rebuild();

      // Verify both are restored with correct data
      const aliceRestored = await request(app.getHttpServer())
        .get(`/accounts/${alice.body.id}`)
        .expect(200);
      expect(aliceRestored.body.owner).toBe('Alice-Rebuild');
      expect(aliceRestored.body.balance).toBe(1000);
      expect(aliceRestored.body.status).toBe('ACTIVE');

      const bobRestored = await request(app.getHttpServer())
        .get(`/accounts/${bob.body.id}`)
        .expect(200);
      expect(bobRestored.body.owner).toBe('Bob-Rebuild');
      expect(bobRestored.body.balance).toBe(2000);
      expect(bobRestored.body.status).toBe('ACTIVE');
    });

    it('rebuild produces empty read model when no events exist', async () => {
      // Tables are already clean from beforeEach truncation
      await accountProjector.rebuild();

      const listResponse = await request(app.getHttpServer())
        .get('/accounts')
        .expect(200);

      expect(listResponse.body).toEqual([]);
    });
  });
});
