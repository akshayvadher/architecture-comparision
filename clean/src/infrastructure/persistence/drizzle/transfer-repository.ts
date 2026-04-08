import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Transfer } from '../../../entities/transfer';
import { TransferGateway } from '../../../use-cases/gateways/transfer.gateway';
import { DRIZZLE, DrizzleDB } from './drizzle.provider';
import { transfers } from './schema';

@Injectable()
export class DrizzleTransferRepository implements TransferGateway {
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

    return this.toDomain(row);
  }

  async findById(id: string): Promise<Transfer | undefined> {
    const [row] = await this.db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id));

    return row ? this.toDomain(row) : undefined;
  }

  private toDomain(row: {
    id: string;
    fromAccountId: string;
    toAccountId: string;
    amount: string;
    timestamp: Date;
    status: string;
  }): Transfer {
    return new Transfer(
      row.id,
      row.fromAccountId,
      row.toAccountId,
      parseFloat(row.amount),
      row.timestamp,
      row.status,
    );
  }
}
