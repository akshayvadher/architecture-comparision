import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { ConcurrencyError } from '../../domain/errors/domain-errors';
import {
  AccountCreated,
  AccountCredited,
  AccountDebited,
} from '../../domain/events/account-events';
import {
  TransferCompleted,
  TransferFailed,
  TransferInitiated,
} from '../../domain/events/transfer-events';
import { DRIZZLE, type DrizzleDB } from '../persistence/database';
import { events, outbox } from '../persistence/schema';

export interface StoredEvent {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventData: unknown;
  version: number;
  timestamp: Date;
}

export interface DomainEvent {
  type: string;
  data: Record<string, unknown>;
}

interface EventRow {
  id: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventData: Record<string, unknown>;
  version: number;
  timestamp: Date;
}

const EVENT_CLASS_MAP: Record<string, new (...args: any[]) => any> = {
  AccountCreated,
  AccountDebited,
  AccountCredited,
  TransferInitiated,
  TransferCompleted,
  TransferFailed,
};

@Injectable()
export class EventStore {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async append(
    aggregateId: string,
    aggregateType: string,
    newEvents: DomainEvent[],
    expectedVersion: number,
  ): Promise<void> {
    const rows = buildEventRows(
      aggregateId,
      aggregateType,
      newEvents,
      expectedVersion,
    );

    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(events).values(rows);
        await tx.insert(outbox).values(rows.map(toOutboxRow));
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConcurrencyError(aggregateId);
      }
      throw error;
    }
  }

  async appendMultiple(
    batches: Array<{
      aggregateId: string;
      aggregateType: string;
      events: DomainEvent[];
      expectedVersion: number;
    }>,
  ): Promise<void> {
    const allRows = batches.flatMap((batch) =>
      buildEventRows(
        batch.aggregateId,
        batch.aggregateType,
        batch.events,
        batch.expectedVersion,
      ),
    );

    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(events).values(allRows);
        await tx.insert(outbox).values(allRows.map(toOutboxRow));
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        const aggregateIds = batches.map((b) => b.aggregateId).join(', ');
        throw new ConcurrencyError(aggregateIds);
      }
      throw error;
    }
  }

  async loadEvents(aggregateId: string): Promise<StoredEvent[]> {
    return this.db
      .select()
      .from(events)
      .where(eq(events.aggregateId, aggregateId))
      .orderBy(asc(events.version));
  }

  deserializeEvent(stored: StoredEvent): object {
    const EventClass = EVENT_CLASS_MAP[stored.eventType];
    if (!EventClass) {
      throw new Error(`Unknown event type: ${stored.eventType}`);
    }
    const data = stored.eventData as Record<string, unknown>;
    return Object.assign(new EventClass(), data);
  }

  deserializeEvents(storedEvents: StoredEvent[]): object[] {
    return storedEvents.map((e) => this.deserializeEvent(e));
  }
}

function buildEventRows(
  aggregateId: string,
  aggregateType: string,
  newEvents: DomainEvent[],
  expectedVersion: number,
): EventRow[] {
  return newEvents.map((event, index) => ({
    id: crypto.randomUUID(),
    aggregateId,
    aggregateType,
    eventType: event.type,
    eventData: event.data,
    version: expectedVersion + index + 1,
    timestamp: new Date(),
  }));
}

function toOutboxRow(row: EventRow) {
  return {
    aggregateId: row.aggregateId,
    aggregateType: row.aggregateType,
    eventType: row.eventType,
    eventData: row.eventData,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}
