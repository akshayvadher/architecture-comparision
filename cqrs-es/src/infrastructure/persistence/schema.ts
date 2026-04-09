import {
  integer,
  jsonb,
  numeric,
  pgTable,
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
