import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { Transfer, TransferStatus } from '../../../domain/aggregates/transfer';
import { DomainEvent } from '../../../domain/events/domain-event';
import { TransferRepository } from '../../../domain/repositories/transfer-repository.interface';
import { AccountId } from '../../../domain/value-objects/account-id';
import { Money } from '../../../domain/value-objects/money';
import { TransferId } from '../../../domain/value-objects/transfer-id';
import { DRIZZLE, DrizzleDB } from './drizzle.provider';
import { domainEvents, transfers } from './schema';

@Injectable()
export class DrizzleTransferRepository implements TransferRepository {
  constructor(@Inject(DRIZZLE) protected readonly db: DrizzleDB) {}

  async save(transfer: Transfer): Promise<void> {
    await this.db.insert(transfers).values({
      id: transfer.id.value,
      fromAccountId: transfer.fromAccountId.value,
      toAccountId: transfer.toAccountId.value,
      amount: transfer.amount.value.toString(),
      timestamp: transfer.timestamp,
      status: transfer.status,
    });

    await this.saveEvents(transfer.id.value, transfer.domainEvents);
  }

  async findById(id: TransferId): Promise<Transfer | null> {
    const [row] = await this.db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id.value));

    if (!row) return null;

    const eventRows = await this.db
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.aggregateId, id.value));

    return this.toDomain(row, eventRows);
  }

  private async saveEvents(
    aggregateId: string,
    events: ReadonlyArray<DomainEvent>,
  ): Promise<void> {
    for (const event of events) {
      await this.db.insert(domainEvents).values({
        id: randomUUID(),
        aggregateId,
        type: event.type,
        data: event.data,
        timestamp: event.timestamp,
      });
    }
  }

  private toDomain(
    row: { id: string; fromAccountId: string; toAccountId: string; amount: string; timestamp: Date; status: string },
    eventRows: { type: string; data: unknown; timestamp: Date }[],
  ): Transfer {
    const events: DomainEvent[] = eventRows.map((e) => ({
      type: e.type,
      data: e.data as Record<string, unknown>,
      timestamp: e.timestamp,
    }));

    return Transfer.reconstitute(
      TransferId.create(row.id),
      AccountId.create(row.fromAccountId),
      AccountId.create(row.toAccountId),
      Money.create(parseFloat(row.amount)),
      row.timestamp,
      row.status as TransferStatus,
      events,
    );
  }
}
