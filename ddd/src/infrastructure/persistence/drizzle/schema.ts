import {
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  owner: text('owner').notNull(),
  balance: numeric('balance', { precision: 15, scale: 2 }).notNull(),
  status: text('status').notNull().default('ACTIVE'),
});

export const transfers = pgTable('transfers', {
  id: uuid('id').primaryKey(),
  fromAccountId: uuid('from_account_id')
    .notNull()
    .references(() => accounts.id),
  toAccountId: uuid('to_account_id')
    .notNull()
    .references(() => accounts.id),
  amount: numeric('amount', { precision: 15, scale: 2 }).notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  status: text('status').notNull(),
});

export const domainEvents = pgTable('domain_events', {
  id: uuid('id').primaryKey(),
  aggregateId: uuid('aggregate_id').notNull(),
  type: text('type').notNull(),
  data: jsonb('data').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
});
