import { Inject, Injectable } from '@nestjs/common';
import {
  DRIZZLE,
  type DrizzleDB,
} from '../infrastructure/persistence/database';
import { transferReadModel } from '../infrastructure/persistence/schema';

@Injectable()
export class TransferProjector {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async projectCompleted(
    transferId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    timestamp: string,
  ): Promise<void> {
    await this.insertTransfer(
      transferId,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
      'COMPLETED',
    );
  }

  async projectFailed(
    transferId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    timestamp: string,
  ): Promise<void> {
    await this.insertTransfer(
      transferId,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
      'FAILED',
    );
  }

  private async insertTransfer(
    transferId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    timestamp: string,
    status: string,
  ): Promise<void> {
    await this.db.insert(transferReadModel).values({
      id: transferId,
      fromAccountId,
      toAccountId,
      amount: String(amount),
      timestamp: new Date(timestamp),
      status,
    });
  }
}
