import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { eq } from 'drizzle-orm';
import { GetTransferQuery } from './get-transfer.query';
import { DRIZZLE, DrizzleDB } from '../infrastructure/persistence/database';
import { transferReadModel } from '../infrastructure/persistence/schema';
import {
  InvalidIdError,
  TransferNotFoundError,
} from '../domain/errors/domain-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@QueryHandler(GetTransferQuery)
export class GetTransferHandler implements IQueryHandler<GetTransferQuery> {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute(query: GetTransferQuery) {
    if (!UUID_REGEX.test(query.id)) {
      throw new InvalidIdError(query.id);
    }

    const rows = await this.db
      .select()
      .from(transferReadModel)
      .where(eq(transferReadModel.id, query.id));

    if (rows.length === 0) {
      throw new TransferNotFoundError(query.id);
    }

    const row = rows[0];
    return {
      id: row.id,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      amount: Number(row.amount),
      timestamp: row.timestamp.toISOString(),
      status: row.status,
    };
  }
}
