import type { Transfer } from '../aggregates/transfer';
import type { TransferId } from '../value-objects/transfer-id';

export const TRANSFER_REPOSITORY = Symbol('TRANSFER_REPOSITORY');

export interface TransferRepository {
  save(transfer: Transfer): Promise<void>;
  findById(id: TransferId): Promise<Transfer | null>;
}
