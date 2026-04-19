import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt } from 'drizzle-orm';
import { ConcurrencyError } from '../../domain/errors/domain-errors';
import { DRIZZLE, type DrizzleDB } from '../persistence/database';
import { events, outbox, snapshots } from '../persistence/schema';

export interface StoredSnapshot {
  version: number;
  state: unknown;
}

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

  async loadEventsSince(
    aggregateId: string,
    afterVersion: number,
  ): Promise<StoredEvent[]> {
    return this.db
      .select()
      .from(events)
      .where(
        and(
          eq(events.aggregateId, aggregateId),
          gt(events.version, afterVersion),
        ),
      )
      .orderBy(asc(events.version));
  }

  async saveSnapshot(
    aggregateId: string,
    aggregateType: string,
    version: number,
    state: unknown,
  ): Promise<void> {
    await this.db
      .insert(snapshots)
      .values({
        aggregateId,
        aggregateType,
        version,
        state: state as Record<string, unknown>,
      })
      .onConflictDoUpdate({
        target: [snapshots.aggregateId, snapshots.aggregateType],
        set: { version, state: state as Record<string, unknown> },
      });
  }

  async loadSnapshot(
    aggregateId: string,
    aggregateType: string,
  ): Promise<StoredSnapshot | null> {
    const rows = await this.db
      .select({ version: snapshots.version, state: snapshots.state })
      .from(snapshots)
      .where(
        and(
          eq(snapshots.aggregateId, aggregateId),
          eq(snapshots.aggregateType, aggregateType),
        ),
      )
      .limit(1);
    if (rows.length === 0) {
      return null;
    }
    return { version: rows[0].version, state: rows[0].state };
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
