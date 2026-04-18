import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/infrastructure/app.module';
import {
  accountReadModel,
  idempotencyKeys,
} from '../src/infrastructure/persistence/schema';
import { db, TEST_DATABASE_URL } from './setup';

describe('Idempotency — Integration', () => {
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

  it('returns the same cached response when POST /accounts is retried with the same Idempotency-Key and body', async () => {
    const key = `key-${crypto.randomUUID()}`;
    const body = { owner: 'Alice', balance: 1000 };

    const first = await request(app.getHttpServer())
      .post('/accounts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/accounts')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(second.body).toEqual(first.body);

    const accounts = await db.select().from(accountReadModel);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe(first.body.id);
  });

  it('returns 409 IdempotencyKeyReused when the same key is used with a different body', async () => {
    const key = `key-${crypto.randomUUID()}`;

    await request(app.getHttpServer())
      .post('/accounts')
      .set('Idempotency-Key', key)
      .send({ owner: 'Alice', balance: 1000 })
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/accounts')
      .set('Idempotency-Key', key)
      .send({ owner: 'Bob', balance: 500 })
      .expect(409);

    expect(conflict.body.error.code).toBe('IdempotencyKeyReused');
  });

  it('creates two separate accounts when no Idempotency-Key header is sent', async () => {
    const body = { owner: 'Charlie', balance: 300 };

    const first = await request(app.getHttpServer())
      .post('/accounts')
      .send(body)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/accounts')
      .send(body)
      .expect(201);

    expect(second.body.id).not.toBe(first.body.id);
  });

  it('persists an idempotency_keys row after a keyed POST /accounts', async () => {
    const key = `key-${crypto.randomUUID()}`;

    await request(app.getHttpServer())
      .post('/accounts')
      .set('Idempotency-Key', key)
      .send({ owner: 'Diana', balance: 2000 })
      .expect(201);

    const rows = await db
      .select()
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.key, key),
          eq(idempotencyKeys.endpoint, '/accounts'),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0].responseStatus).toBe(201);
  });

  it('replays a cached POST /transfers response on retry with the same key', async () => {
    const source = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Src', balance: 1000 })
      .expect(201);
    const destination = await request(app.getHttpServer())
      .post('/accounts')
      .send({ owner: 'Dst', balance: 0 })
      .expect(201);

    const key = `key-${crypto.randomUUID()}`;
    const body = {
      fromAccountId: source.body.id,
      toAccountId: destination.body.id,
      amount: 200,
    };

    const first = await request(app.getHttpServer())
      .post('/transfers')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/transfers')
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(second.body).toEqual(first.body);

    const sourceAfter = await request(app.getHttpServer())
      .get(`/accounts/${source.body.id}`)
      .expect(200);
    expect(sourceAfter.body.balance).toBe(800);
  });
});
