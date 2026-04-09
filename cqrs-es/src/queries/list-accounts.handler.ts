import { Inject, Injectable } from '@nestjs/common';
import {
  DRIZZLE,
  type DrizzleDB,
} from '../infrastructure/persistence/database';
import { accountReadModel } from '../infrastructure/persistence/schema';
import type { AccountReadDto } from './get-account.handler';

@Injectable()
export class ListAccountsHandler {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute(): Promise<AccountReadDto[]> {
    const rows = await this.db.select().from(accountReadModel);

    return rows.map((row) => ({
      id: row.id,
      owner: row.owner,
      balance: Number(row.balance),
      status: row.status,
    }));
  }
}
