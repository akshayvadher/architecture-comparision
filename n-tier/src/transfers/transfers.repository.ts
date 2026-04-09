import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/drizzle.provider';
import { transfers } from '../database/schema';

export interface TransferRow {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  timestamp: Date;
  status: string;
}

@Injectable()
export class TransfersRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async insert(tx: DrizzleDB, transfer: TransferRow): Promise<TransferRow> {
    const [inserted] = await tx.insert(transfers).values(transfer).returning();
    return inserted;
  }

  async findById(id: string): Promise<TransferRow | undefined> {
    const [row] = await this.db
      .select()
      .from(transfers)
      .where(eq(transfers.id, id));
    return row;
  }

  async insertWithDefaultDb(transfer: TransferRow): Promise<TransferRow> {
    const [inserted] = await this.db
      .insert(transfers)
      .values(transfer)
      .returning();
    return inserted;
  }
}
