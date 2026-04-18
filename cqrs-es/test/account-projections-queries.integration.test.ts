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

describe('Account Projections and Queries — Integration (HTTP + real DB)', () => {
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

  // --- AC 1: Read model table stores current state (id, owner, balance, status) ---

  it('stores account state in the read model table after creation', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 1000 })
      .expect(201);

    const accountId = response.body.id;

    const rows = await db
      .select()
      .from(accountReadModel)
      .where(eq(accountReadModel.id, accountId));

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(accountId);
    expect(rows[0].owner).toBe('Alice');
    expect(Number(rows[0].balance)).toBe(1000);
    expect(rows[0].status).toBe('ACTIVE');
  });

  // --- AC 2: Projection updates synchronously when AccountCreated event is appended ---

  it('updates the projection synchronously when an account is created — no delay between write and read', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Bob', balance: 500 })
      .expect(201);

    const accountId = createResponse.body.id;

    // Immediately query the read model — projection should already be there
    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .expect(200);

    expect(getResponse.body.id).toBe(accountId);
    expect(getResponse.body.owner).toBe('Bob');
    expect(getResponse.body.balance).toBe(500);
    expect(getResponse.body.status).toBe('ACTIVE');
  });

  // --- AC 3: Retrieve account by id via GET /accounts/:id ---

  it('retrieves an account by id via GET /accounts/:id', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Charlie', balance: 750 })
      .expect(201);

    const accountId = createResponse.body.id;

    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .expect(200);

    expect(getResponse.body.id).toBe(accountId);
  });

  // --- AC 4: Response includes id, owner, balance, and status ---

  it('returns id, owner, balance, and status in the GET /accounts/:id response', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Diana', balance: 250 })
      .expect(201);

    const accountId = createResponse.body.id;

    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .expect(200);

    expect(getResponse.body).toEqual({
      id: accountId,
      owner: 'Diana',
      balance: 250,
      status: 'ACTIVE',
    });
  });

  // --- AC 5: Non-existent account returns not-found error ---

  it('returns 404 when requesting a non-existent account id', async () => {
    const nonExistentId = '00000000-0000-0000-0000-000000000000';

    const response = await request(app.getHttpServer())
      .get(`/accounts/${nonExistentId}`)
      .expect(404);

    expect(response.body.error.message).toBeDefined();
    expect(response.body.error.code).toBeDefined();
  });

  // --- AC 6: Invalid id format returns error ---

  it('returns 400 when requesting an account with an invalid id format', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts/not-a-uuid')
      .expect(400);

    expect(response.body.error.message).toBeDefined();
    expect(response.body.error.code).toBeDefined();
  });

  it('returns 400 for a numeric id instead of UUID', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts/12345')
      .expect(400);

    expect(response.body.error.message).toBeDefined();
    expect(response.body.error.code).toBeDefined();
  });

  // --- AC 7: List all accounts via GET /accounts ---

  it('lists all accounts via GET /accounts', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Eve', balance: 100 })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body.length).toBeGreaterThanOrEqual(1);

    const eve = listResponse.body.find(
      (a: { owner: string }) => a.owner === 'Eve',
    );
    expect(eve).toBeDefined();
    expect(eve.balance).toBe(100);
    expect(eve.status).toBe('ACTIVE');
  });

  // --- AC 8: Empty collection when no accounts exist ---

  it('returns an empty array from GET /accounts when no accounts exist', async () => {
    // setup.ts truncates both tables in beforeEach, so the DB is clean here
    const listResponse = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    expect(listResponse.body).toEqual([]);
  });

  // --- AC 9: Multiple accounts all returned in the list ---

  it('returns all accounts when multiple exist', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Frank', balance: 300 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Grace', balance: 600 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Hank', balance: 900 })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    const owners = listResponse.body.map((a: { owner: string }) => a.owner);
    expect(owners).toContain('Frank');
    expect(owners).toContain('Grace');
    expect(owners).toContain('Hank');
    expect(listResponse.body.length).toBe(3);
  });

  // --- AC 10: GET endpoints read from the projection table, not from the event store ---

  it('reads from the projection table — deleting the read model row causes GET to return 404 even though events remain', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Ivan', balance: 400 })
      .expect(201);

    const accountId = createResponse.body.id;

    // Verify the event exists in the event store
    const storedEvents = await db
      .select()
      .from(events)
      .where(eq(events.aggregateId, accountId));
    expect(storedEvents.length).toBeGreaterThanOrEqual(1);

    // Delete only the read model row — leave the event store intact
    await db.delete(accountReadModel).where(eq(accountReadModel.id, accountId));

    // GET should return 404 because the query reads from the projection, not the event store
    await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .expect(404);
  });

  it('reads from the projection table — account missing from list after read model deletion even though events remain', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Julia', balance: 200 })
      .expect(201);

    const accountId = createResponse.body.id;

    // Delete the read model row
    await db.delete(accountReadModel).where(eq(accountReadModel.id, accountId));

    // List should not include this account
    const listResponse = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    const ids = listResponse.body.map((a: { id: string }) => a.id);
    expect(ids).not.toContain(accountId);
  });

  // --- AC 11: Query handlers are separate from command handlers ---
  // This is a structural concern. We verify it by confirming the GET path uses
  // different data access than the POST path (the CQRS split is proven by AC 10
  // tests above — read model vs event store). Additionally, we verify the response
  // shape from GET is independently correct from the POST response.

  it('GET /accounts/:id returns data from the read model independently of the create response', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Kevin', balance: 550 })
      .expect(201);

    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${createResponse.body.id}`)
      .expect(200);

    // Both should agree on the data, proving the projection was correctly built
    expect(getResponse.body.id).toBe(createResponse.body.id);
    expect(getResponse.body.owner).toBe(createResponse.body.owner);
    expect(getResponse.body.balance).toBe(createResponse.body.balance);
    expect(getResponse.body.status).toBe(createResponse.body.status);
  });

  // --- AC 12: Projection can be rebuilt from scratch by replaying all events ---

  it('rebuilds the projection from scratch by replaying all events from the event store', async () => {
    // Create two accounts via the normal flow
    const response1 = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Leo', balance: 1000 })
      .expect(201);

    const response2 = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Mia', balance: 2000 })
      .expect(201);

    // Delete all read model rows — simulating a corrupted or lost projection
    await db.delete(accountReadModel);

    // Verify the read model is empty
    const emptyList = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);
    expect(emptyList.body).toEqual([]);

    // Rebuild the projection from the event store
    await accountProjector.rebuild();

    // Verify both accounts are restored with correct state
    const rebuiltList = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    expect(rebuiltList.body).toHaveLength(2);

    const leo = rebuiltList.body.find(
      (a: { owner: string }) => a.owner === 'Leo',
    );
    const mia = rebuiltList.body.find(
      (a: { owner: string }) => a.owner === 'Mia',
    );

    expect(leo).toBeDefined();
    expect(leo.id).toBe(response1.body.id);
    expect(leo.balance).toBe(1000);
    expect(leo.status).toBe('ACTIVE');

    expect(mia).toBeDefined();
    expect(mia.id).toBe(response2.body.id);
    expect(mia.balance).toBe(2000);
    expect(mia.status).toBe('ACTIVE');
  });

  it('rebuild produces correct state even when the read model already has stale data', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Nina', balance: 800 })
      .expect(201);

    const accountId = createResponse.body.id;

    // Corrupt the read model by setting a wrong balance
    await db
      .update(accountReadModel)
      .set({ balance: '999999' })
      .where(eq(accountReadModel.id, accountId));

    // Verify the corruption is visible
    const corruptedResponse = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .expect(200);
    expect(corruptedResponse.body.balance).toBe(999999);

    // Rebuild the projection
    await accountProjector.rebuild();

    // Verify the correct balance is restored
    const restoredResponse = await request(app.getHttpServer())
      .get(`/accounts/${accountId}`)
      .expect(200);
    expect(restoredResponse.body.balance).toBe(800);
    expect(restoredResponse.body.owner).toBe('Nina');
  });

  // --- Additional: balance type is number, not string ---

  it('returns balance as a number in GET /accounts/:id, not as a string', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Oscar', balance: 123 })
      .expect(201);

    const getResponse = await request(app.getHttpServer())
      .get(`/accounts/${createResponse.body.id}`)
      .expect(200);

    expect(typeof getResponse.body.balance).toBe('number');
  });

  it('returns balance as a number in GET /accounts list items, not as a string', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Pam', balance: 456 })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get('/accounts')
      .expect(200);

    for (const account of listResponse.body) {
      expect(typeof account.balance).toBe('number');
    }
  });
});
