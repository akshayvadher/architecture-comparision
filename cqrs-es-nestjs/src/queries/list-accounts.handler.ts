import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  DRIZZLE,
  type DrizzleDB,
} from '../infrastructure/persistence/database';
import { accountReadModel } from '../infrastructure/persistence/schema';
import { ListAccountsQuery } from './list-accounts.query';

@QueryHandler(ListAccountsQuery)
export class ListAccountsHandler implements IQueryHandler<ListAccountsQuery> {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute() {
    const rows = await this.db.select().from(accountReadModel);

    return rows.map((row) => ({
      id: row.id,
      owner: row.owner,
      balance: Number(row.balance),
      status: row.status,
    }));
  }
}
