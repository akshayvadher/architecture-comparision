import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../database/drizzle.provider';
import { accounts } from '../database/schema';

export interface AccountRow {
  id: string;
  owner: string;
  balance: string;
  status: string;
}

@Injectable()
export class AccountsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async insert(account: AccountRow): Promise<AccountRow> {
    const [inserted] = await this.db
      .insert(accounts)
      .values(account)
      .returning();
    return inserted;
  }

  async findById(id: string): Promise<AccountRow | undefined> {
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, id));
    return row;
  }

  async findAll(): Promise<AccountRow[]> {
    return this.db.select().from(accounts);
  }

  async findByIdForUpdate(tx: DrizzleDB, id: string): Promise<AccountRow | undefined> {
    const result = await tx.execute(
      sql`SELECT id, owner, balance, status FROM accounts WHERE id = ${id} FOR UPDATE`,
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return row as unknown as AccountRow;
  }

  async updateBalance(tx: DrizzleDB, id: string, newBalance: string): Promise<void> {
    await tx
      .update(accounts)
      .set({ balance: newBalance })
      .where(eq(accounts.id, id));
  }
}
