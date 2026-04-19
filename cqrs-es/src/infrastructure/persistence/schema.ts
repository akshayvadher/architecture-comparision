import {
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(),
    aggregateId: uuid('aggregate_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    eventType: text('event_type').notNull(),
    eventData: jsonb('event_data').notNull(),
    version: integer('version').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('aggregate_version_unique').on(table.aggregateId, table.version),
  ],
);

export const accountReadModel = pgTable('account_read_model', {
  id: uuid('id').primaryKey(),
  owner: text('owner').notNull(),
  balance: numeric('balance').notNull(),
  status: text('status').notNull(),
});

export const transferReadModel = pgTable('transfer_read_model', {
  id: uuid('id').primaryKey(),
  fromAccountId: uuid('from_account_id').notNull(),
  toAccountId: uuid('to_account_id').notNull(),
  amount: numeric('amount').notNull(),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
});

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    endpoint: text('endpoint').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.key, table.endpoint] })],
);

export const outbox = pgTable('outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  aggregateId: text('aggregate_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  eventType: text('event_type').notNull(),
  eventData: jsonb('event_data').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

export const snapshots = pgTable(
  'snapshots',
  {
    aggregateId: uuid('aggregate_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    version: integer('version').notNull(),
    state: jsonb('state').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.aggregateId, table.aggregateType] }),
  ],
);
