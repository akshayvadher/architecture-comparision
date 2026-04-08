import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Account } from '../../../domain/aggregates/account';
import { AccountRepository } from '../../../domain/repositories/account-repository.interface';
import { AccountId } from '../../../domain/value-objects/account-id';
import { Money } from '../../../domain/value-objects/money';
import { DRIZZLE, DrizzleDB } from './drizzle.provider';
import { accounts } from './schema';

@Injectable()
export class DrizzleAccountRepository implements AccountRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async save(account: Account): Promise<Account> {
    const [row] = await this.db
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
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id.value));

    return row ? this.toDomain(row) : undefined;
  }

  async findAll(): Promise<Account[]> {
    const rows = await this.db.select().from(accounts);
    return rows.map((row) => this.toDomain(row));
  }

  async updateBalance(id: AccountId, newBalance: Money): Promise<void> {
    await this.db
      .update(accounts)
      .set({ balance: newBalance.value.toString() })
      .where(eq(accounts.id, id.value));
  }

  private toDomain(row: {
    id: string;
    owner: string;
    balance: string;
    status: string;
  }): Account {
    return new Account(
      AccountId.create(row.id),
      row.owner,
      Money.create(parseFloat(row.balance)),
      row.status,
    );
  }
}
