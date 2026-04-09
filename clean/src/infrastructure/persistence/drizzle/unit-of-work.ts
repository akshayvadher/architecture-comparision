import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Account } from '../../../entities/account';
import { Transfer } from '../../../entities/transfer';
import type { AccountGateway } from '../../../use-cases/gateways/account.gateway';
import type { TransferGateway } from '../../../use-cases/gateways/transfer.gateway';
import type { UnitOfWorkGateway } from '../../../use-cases/gateways/unit-of-work.gateway';
import { DRIZZLE, type DrizzleDB } from './drizzle.provider';
import { accounts, transfers } from './schema';

@Injectable()
export class DrizzleUnitOfWork implements UnitOfWorkGateway {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute<T>(
    work: (gateways: {
      accountGateway: AccountGateway;
      transferGateway: TransferGateway;
    }) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const accountGateway = new TransactionalAccountGateway(tx);
      const transferGateway = new TransactionalTransferGateway(tx);
      return work({ accountGateway, transferGateway });
    });
  }
}

class TransactionalAccountGateway implements AccountGateway {
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
    return new Account(row.id, row.owner, parseFloat(row.balance), row.status);
  }
}

class TransactionalTransferGateway implements TransferGateway {
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
    return new Transfer(
      row.id,
      row.fromAccountId,
      row.toAccountId,
      parseFloat(row.amount),
      row.timestamp,
      row.status,
    );
  }
}
