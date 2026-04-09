import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  InvalidIdError,
  TransferNotFoundError,
} from '../domain/errors/domain-errors';
import {
  DRIZZLE,
  type DrizzleDB,
} from '../infrastructure/persistence/database';
import { transferReadModel } from '../infrastructure/persistence/schema';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TransferReadDto {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  timestamp: string;
  status: string;
}

@Injectable()
export class GetTransferHandler {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async execute(id: string): Promise<TransferReadDto> {
    if (!UUID_REGEX.test(id)) {
      throw new InvalidIdError(id);
    }

    const rows = await this.db
      .select()
      .from(transferReadModel)
      .where(eq(transferReadModel.id, id));

    if (rows.length === 0) {
      throw new TransferNotFoundError(id);
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
