import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { eq } from 'drizzle-orm';
import {
  AccountNotFoundError,
  InvalidIdError,
} from '../domain/errors/domain-errors';
import {
  DRIZZLE,
  type DrizzleDB,
} from '../infrastructure/persistence/database';
import { accountReadModel } from '../infrastructure/persistence/schema';
import { GetAccountQuery } from './get-account.query';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@QueryHandler(GetAccountQuery)
export class GetAccountHandler implements IQueryHandler<GetAccountQuery> {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute(query: GetAccountQuery) {
    if (!UUID_REGEX.test(query.id)) {
      throw new InvalidIdError(query.id);
    }

    const rows = await this.db
      .select()
      .from(accountReadModel)
      .where(eq(accountReadModel.id, query.id));

    if (rows.length === 0) {
      throw new AccountNotFoundError(query.id);
    }

    const row = rows[0];
    return {
      id: row.id,
      owner: row.owner,
      balance: Number(row.balance),
      status: row.status,
    };
  }
}
