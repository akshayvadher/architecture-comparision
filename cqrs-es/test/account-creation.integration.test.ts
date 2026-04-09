import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Account } from '../src/domain/aggregates/account';
import type { AccountEvent } from '../src/domain/events/account-events';
import { AppModule } from '../src/infrastructure/app.module';
import { events } from '../src/infrastructure/persistence/schema';
import { db, TEST_DATABASE_URL } from './setup';

describe('Account Creation via CQRS/ES — Integration (HTTP + real DB)', () => {
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

  it('creates an account via POST /accounts and returns 201 with id, owner, balance, and ACTIVE status', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 1000 })
      .expect(201);

    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(response.body.owner).toBe('Alice');
    expect(response.body.balance).toBe(1000);
    expect(response.body.status).toBe('ACTIVE');
  });

  it('creates an account with zero balance', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Bob', balance: 0 })
      .expect(201);

    expect(response.body.balance).toBe(0);
    expect(response.body.status).toBe('ACTIVE');
  });

  it('rejects a negative initial balance with 400 status', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: -100 })
      .expect(400);

    expect(response.body.message).toBeDefined();
  });

  it('rejects a missing owner name with 400 status', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ balance: 100 })
      .expect(400);

    expect(response.body.message).toBeDefined();
  });

  it('rejects an empty owner name with 400 status', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: '', balance: 100 })
      .expect(400);

    expect(response.body.message).toBeDefined();
  });

  it('stores exactly one AccountCreated event in the event store after creating an account', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Charlie', balance: 750 })
      .expect(201);

    const accountId = createResponse.body.id;

    const storedEvents = await db
      .select()
      .from(events)
      .where(eq(events.aggregateId, accountId));

    expect(storedEvents).toHaveLength(1);
    expect(storedEvents[0].eventType).toBe('AccountCreated');
    expect(storedEvents[0].aggregateType).toBe('Account');
    expect(storedEvents[0].version).toBe(1);

    const eventData = storedEvents[0].eventData as {
      accountId: string;
      owner: string;
      balance: number;
      status: string;
    };
    expect(eventData.accountId).toBe(accountId);
    expect(eventData.owner).toBe('Charlie');
    expect(eventData.balance).toBe(750);
    expect(eventData.status).toBe('ACTIVE');
  });

  it('reconstitutes the account aggregate from the event store with correct state', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Diana', balance: 500 })
      .expect(201);

    const accountId = createResponse.body.id;

    const storedEvents = await db
      .select()
      .from(events)
      .where(eq(events.aggregateId, accountId));

    const domainEvents: AccountEvent[] = storedEvents.map((e) => ({
      type: e.eventType,
      data: e.eventData,
    })) as AccountEvent[];

    const account = Account.reconstitute(domainEvents);

    expect(account.id).toBe(accountId);
    expect(account.owner).toBe('Diana');
    expect(account.balance).toBe(500);
    expect(account.status).toBe('ACTIVE');
  });

  it('enforces optimistic concurrency — conflicting versions for the same aggregate are rejected', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Eve', balance: 1000 })
      .expect(201);

    const accountId = createResponse.body.id;

    // The account was created with version 1. Trying to append another event
    // at version 1 (expectedVersion=0, which yields version 1) should conflict.
    const conflictingRow = {
      id: crypto.randomUUID(),
      aggregateId: accountId,
      aggregateType: 'Account',
      eventType: 'AccountCredited',
      eventData: { accountId, amount: 100, transferId: crypto.randomUUID() },
      version: 1, // conflicts with the existing AccountCreated at version 1
      timestamp: new Date(),
    };

    await expect(db.insert(events).values(conflictingRow)).rejects.toThrow();
  });
});
