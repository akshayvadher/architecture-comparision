import { Inject, Injectable } from '@nestjs/common';
import { eq, asc } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../persistence/database';
import { events } from '../persistence/schema';
import { ConcurrencyError } from '../../domain/errors/domain-errors';
import { AccountCreated, AccountDebited, AccountCredited } from '../../domain/events/account-events';
import { TransferInitiated, TransferCompleted, TransferFailed } from '../../domain/events/transfer-events';

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
    const rows = newEvents.map((event, index) => ({
      id: crypto.randomUUID(),
      aggregateId,
      aggregateType,
      eventType: event.type,
      eventData: event.data,
      version: expectedVersion + index + 1,
      timestamp: new Date(),
    }));

    try {
      await this.db.insert(events).values(rows);
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
      batch.events.map((event, index) => ({
        id: crypto.randomUUID(),
        aggregateId: batch.aggregateId,
        aggregateType: batch.aggregateType,
        eventType: event.type,
        eventData: event.data,
        version: batch.expectedVersion + index + 1,
        timestamp: new Date(),
      })),
    );

    try {
      await this.db.insert(events).values(allRows);
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

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}
