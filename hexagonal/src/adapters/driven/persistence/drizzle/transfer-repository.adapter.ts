import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Transfer } from '../../../../domain/models/transfer';
import type { TransferRepositoryPort } from '../../../../domain/ports/transfer-repository.port';
import { DRIZZLE, type DrizzleDB } from './drizzle.provider';
import { transfers } from './schema';

@Injectable()
export class DrizzleTransferRepository implements TransferRepositoryPort {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async save(transfer: Transfer): Promise<Transfer> {
    const [row] = await this.db
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

    return toDomain(row);
  }

  async findById(id: string): Promise<Transfer | undefined> {
    const [row] = await this.db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id));

    return row ? toDomain(row) : undefined;
  }
}

function toDomain(row: {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  timestamp: Date;
  status: string;
}): Transfer {
  return {
    id: row.id,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    amount: parseFloat(row.amount),
    timestamp: row.timestamp,
    status: row.status as Transfer['status'],
  };
}
