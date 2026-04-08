import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { Account } from '../../../domain/aggregates/account';
import { Transfer, TransferStatus } from '../../../domain/aggregates/transfer';
import { DomainEvent } from '../../../domain/events/domain-event';
import { AccountRepository } from '../../../domain/repositories/account-repository.interface';
import { TransferRepository } from '../../../domain/repositories/transfer-repository.interface';
import { UnitOfWork } from '../../../domain/repositories/unit-of-work.interface';
import { AccountId } from '../../../domain/value-objects/account-id';
import { Money } from '../../../domain/value-objects/money';
import { TransferId } from '../../../domain/value-objects/transfer-id';
import { DRIZZLE, DrizzleDB } from './drizzle.provider';
import { accounts, domainEvents, transfers } from './schema';

@Injectable()
export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute<T>(
    work: (repositories: {
      accountRepository: AccountRepository;
      transferRepository: TransferRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const accountRepository = new TransactionalAccountRepository(tx);
      const transferRepository = new TransactionalTransferRepository(tx);
      return work({ accountRepository, transferRepository });
    });
  }
}

class TransactionalAccountRepository implements AccountRepository {
  constructor(private readonly tx: DrizzleDB) {}

  async save(account: Account): Promise<Account> {
    const [row] = await this.tx
      .insert(accounts)
      .values({
        id: account.id.value,
        owner: account.owner,
        balance: account.balance.value.toString(),
        status: account.status,
      })
      .returning();

    return this.toDomain(row);
  }

  async findById(id: AccountId): Promise<Account | undefined> {
    const [row] = await this.tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, id.value))
      .for('update');

    return row ? this.toDomain(row) : undefined;
  }

  async findAll(): Promise<Account[]> {
    const rows = await this.tx.select().from(accounts);
    return rows.map((row) => this.toDomain(row));
  }

  async updateBalance(id: AccountId, newBalance: Money): Promise<void> {
    await this.tx
      .update(accounts)
      .set({ balance: newBalance.value.toString() })
      .where(eq(accounts.id, id.value));
  }

  private toDomain(row: { id: string; owner: string; balance: string; status: string }): Account {
    return new Account(
      AccountId.create(row.id),
      row.owner,
      Money.create(parseFloat(row.balance)),
      row.status,
    );
  }
}

class TransactionalTransferRepository implements TransferRepository {
  constructor(private readonly tx: DrizzleDB) {}

  async save(transfer: Transfer): Promise<void> {
    await this.tx.insert(transfers).values({
      id: transfer.id.value,
      fromAccountId: transfer.fromAccountId.value,
      toAccountId: transfer.toAccountId.value,
      amount: transfer.amount.value.toString(),
      timestamp: transfer.timestamp,
      status: transfer.status,
    });

    for (const event of transfer.domainEvents) {
      await this.tx.insert(domainEvents).values({
        id: randomUUID(),
        aggregateId: transfer.id.value,
        type: event.type,
        data: event.data,
        timestamp: event.timestamp,
      });
    }
  }

  async findById(id: TransferId): Promise<Transfer | null> {
    const [row] = await this.tx
      .select()
      .from(transfers)
      .where(eq(transfers.id, id.value));

    if (!row) return null;

    const eventRows = await this.tx
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.aggregateId, id.value));

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
