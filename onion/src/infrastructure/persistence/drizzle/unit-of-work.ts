import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Account } from '../../../domain/model/account';
import { Transfer } from '../../../domain/model/transfer';
import { AccountRepository } from '../../../domain/services/account-repository.interface';
import { TransferRepository } from '../../../domain/services/transfer-repository.interface';
import { UnitOfWork } from '../../../domain/services/unit-of-work.interface';
import { DRIZZLE, DrizzleDB } from './drizzle.provider';
import { accounts, transfers } from './schema';

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
        id: account.id,
        owner: account.owner,
        balance: account.balance.toString(),
        status: account.status,
      })
      .returning();

    return this.toDomain(row);
  }

  async findById(id: string): Promise<Account | undefined> {
    const [row] = await this.tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, id))
      .for('update');

    return row ? this.toDomain(row) : undefined;
  }

  async findAll(): Promise<Account[]> {
    const rows = await this.tx.select().from(accounts);
    return rows.map((row) => this.toDomain(row));
  }

  async updateBalance(id: string, newBalance: number): Promise<void> {
    await this.tx
      .update(accounts)
      .set({ balance: newBalance.toString() })
      .where(eq(accounts.id, id));
  }

  private toDomain(row: {
    id: string;
    owner: string;
    balance: string;
    status: string;
  }): Account {
    return {
      id: row.id,
      owner: row.owner,
      balance: parseFloat(row.balance),
      status: row.status,
    };
  }
}

class TransactionalTransferRepository implements TransferRepository {
  constructor(private readonly tx: DrizzleDB) {}

  async save(transfer: Transfer): Promise<Transfer> {
    const [row] = await this.tx
      .insert(transfers)
      .values({
        id: transfer.id,
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        amount: transfer.amount.toString(),
        timestamp: transfer.timestamp,
        status: transfer.status,
      })
      .returning();

    return this.toDomain(row);
  }

  async findById(id: string): Promise<Transfer | undefined> {
    const [row] = await this.tx
      .select()
      .from(transfers)
      .where(eq(transfers.id, id));

    return row ? this.toDomain(row) : undefined;
  }

  private toDomain(row: {
    id: string;
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    timestamp: Date;
    status: string;
  }): Transfer {
    return {
      id: row.id,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      amount: parseFloat(row.amount),
      timestamp: row.timestamp,
      status: row.status as Transfer['status'],
    };
  }
}
