import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Account } from '../../../domain/model/account';
import { AccountRepository } from '../../../domain/services/account-repository.interface';
import { DRIZZLE, DrizzleDB } from './drizzle.provider';
import { accounts } from './schema';

@Injectable()
export class DrizzleAccountRepository implements AccountRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async save(account: Account): Promise<Account> {
    const [row] = await this.db
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
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id));

    return row ? this.toDomain(row) : undefined;
  }

  async findAll(): Promise<Account[]> {
    const rows = await this.db.select().from(accounts);
    return rows.map((row) => this.toDomain(row));
  }

  async updateBalance(id: string, newBalance: number): Promise<void> {
    await this.db
      .update(accounts)
      .set({ balance: newBalance.toString() })
      .where(eq(accounts.id, id));
  }

  private toDomain(row: { id: string; owner: string; balance: string; status: string }): Account {
    return {
      id: row.id,
      owner: row.owner,
      balance: parseFloat(row.balance),
      status: row.status,
    };
  }
}
