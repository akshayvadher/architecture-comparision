import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq, isNull } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/infrastructure/app.module';
import { EventStore } from '../src/infrastructure/event-store/event-store';
import { OutboxPublisher } from '../src/infrastructure/outbox/outbox-publisher.service';
import { outbox } from '../src/infrastructure/persistence/schema';
import { db, TEST_DATABASE_URL } from './setup';

describe('Outbox — Integration', () => {
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

  it('writes exactly one AccountCreated row to the outbox after POST /accounts', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 1000 })
      .expect(201);

    const rows = await db
      .select()
      .from(outbox)
      .where(eq(outbox.aggregateId, response.body.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('AccountCreated');
    expect(rows[0].aggregateType).toBe('Account');
    expect(rows[0].publishedAt).toBeNull();
  });

  it('writes TransferInitiated, AccountDebited, AccountCredited, and TransferCompleted rows to the outbox for a successful transfer', async () => {
    const source = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 1000 })
      .expect(201);
    const destination = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Bob', balance: 0 })
      .expect(201);

    const transfer = await request(app.getHttpServer())
      .post('/transfers')
      .send({
        fromAccountId: source.body.id,
        toAccountId: destination.body.id,
        amount: 100,
      })
      .expect(201);

    const rows = await db.select().from(outbox);
    const eventTypes = rows.map((r) => r.eventType).sort();

    expect(eventTypes).toEqual(
      [
        'AccountCreated',
        'AccountCreated',
        'AccountCredited',
        'AccountDebited',
        'TransferCompleted',
        'TransferInitiated',
      ].sort(),
    );

    const transferRows = rows.filter((r) => r.aggregateId === transfer.body.id);
    expect(transferRows.map((r) => r.eventType).sort()).toEqual([
      'TransferCompleted',
      'TransferInitiated',
    ]);
  });

  it('marks outbox rows as published when OutboxPublisher.flush() is invoked', async () => {
    await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Alice', balance: 1000 })
      .expect(201);

    const publisher = app.get(OutboxPublisher);
    await publisher.flush();

    const unpublished = await db
      .select()
      .from(outbox)
      .where(isNull(outbox.publishedAt));
    expect(unpublished).toHaveLength(0);

    const all = await db.select().from(outbox);
    expect(all.length).toBeGreaterThan(0);
    for (const row of all) {
      expect(row.publishedAt).not.toBeNull();
    }
  });

  it('leaves no outbox rows when the event-store transaction fails with a concurrency conflict', async () => {
    const eventStore = app.get(EventStore);
    const aggregateId = crypto.randomUUID();

    await eventStore.append(
      aggregateId,
      'Account',
      [
        {
          type: 'AccountCreated',
          data: { accountId: aggregateId, owner: 'X', balance: 10 },
        },
      ],
      0,
    );

    const before = await db
      .select()
      .from(outbox)
      .where(eq(outbox.aggregateId, aggregateId));
    expect(before).toHaveLength(1);

    await expect(
      eventStore.append(
        aggregateId,
        'Account',
        [
          {
            type: 'AccountCredited',
            data: { accountId: aggregateId, amount: 5, transferId: 't' },
          },
        ],
        0,
      ),
    ).rejects.toThrow();

    const after = await db
      .select()
      .from(outbox)
      .where(eq(outbox.aggregateId, aggregateId));
    expect(after).toHaveLength(1);
  });
});
