import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/infrastructure/app.module';
import { snapshots } from '../src/infrastructure/persistence/schema';
import { db, TEST_DATABASE_URL } from './setup';

// Use the default SNAPSHOT_EVERY_N_EVENTS (10) because @nestjs/config's
// validate() runs at module-import time, before this file's top-level
// statements can override process.env. 10 events = 1 AccountCreated + 9
// AccountDebited, i.e. 9 transfers from Alice.
const SNAPSHOT_EVERY = 10;

describe('Aggregate snapshotting — Integration (HTTP + real DB)', () => {
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

  async function transfer(fromId: string, toId: string, amount: number) {
    const res = await request(app.getHttpServer())
      .post('/transfers')
      .send({ fromAccountId: fromId, toAccountId: toId, amount });
    if (res.status !== 201) {
      throw new Error(
        `transfer failed ${res.status}: ${JSON.stringify(res.body)}`,
      );
    }
    return res;
  }

  async function getSnapshot(aggregateId: string) {
    const rows = await db
      .select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.aggregateId, aggregateId),
          eq(snapshots.aggregateType, 'Account'),
        ),
      );
    return rows[0];
  }

  async function transferNTimes(
    fromId: string,
    toId: string,
    amount: number,
    n: number,
  ) {
    for (let i = 0; i < n; i += 1) {
      await transfer(fromId, toId, amount);
    }
  }

  it('does not write a snapshot before the Nth event', async () => {
    const alice = await createAccount('Alice', 10_000);
    const bob = await createAccount('Bob', 10_000);

    // Alice: AccountCreated (v1) + 8 AccountDebited (v2..v9) = v9, below N=10.
    await transferNTimes(alice.id, bob.id, 10, SNAPSHOT_EVERY - 2);

    const snapshot = await getSnapshot(alice.id);
    expect(snapshot).toBeUndefined();
  });

  it('writes a snapshot when account event count crosses N', async () => {
    const alice = await createAccount('Alice', 10_000);
    const bob = await createAccount('Bob', 10_000);

    // Alice: AccountCreated (v1) + 9 AccountDebited = v10 → snapshot at 10.
    await transferNTimes(alice.id, bob.id, 10, SNAPSHOT_EVERY - 1);

    const snapshot = await getSnapshot(alice.id);
    expect(snapshot).toBeDefined();
    expect(snapshot.version).toBe(SNAPSHOT_EVERY);
    const state = snapshot.state as {
      id: string;
      balance: number;
      version: number;
    };
    expect(state.id).toBe(alice.id);
    expect(state.balance).toBe(10_000 - 10 * (SNAPSHOT_EVERY - 1));
    expect(state.version).toBe(SNAPSHOT_EVERY);
  });

  it('subsequent transfer uses snapshot as base and replays only newer events', async () => {
    const alice = await createAccount('Alice', 10_000);
    const bob = await createAccount('Bob', 10_000);

    // Reach v=SNAPSHOT_EVERY so a snapshot exists.
    await transferNTimes(alice.id, bob.id, 100, SNAPSHOT_EVERY - 1);

    const snapshotBefore = await getSnapshot(alice.id);
    expect(snapshotBefore).toBeDefined();
    expect(snapshotBefore.version).toBe(SNAPSHOT_EVERY);

    // One more transfer — the handler must replay snapshot + one new event.
    const res = await transfer(alice.id, bob.id, 100);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('COMPLETED');

    const aliceResponse = await request(app.getHttpServer()).get(
      `/accounts/${alice.id}`,
    );
    expect(aliceResponse.body.balance).toBe(10_000 - 100 * SNAPSHOT_EVERY);
  });
});
