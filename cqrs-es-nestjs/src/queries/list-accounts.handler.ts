import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListAccountsQuery } from './list-accounts.query';
import { DRIZZLE, DrizzleDB } from '../infrastructure/persistence/database';
import { accountReadModel } from '../infrastructure/persistence/schema';

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
