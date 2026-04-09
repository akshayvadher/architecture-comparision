import type { Transfer } from '../models/transfer';

export const TRANSFER_REPOSITORY = 'TRANSFER_REPOSITORY';

export interface TransferRepositoryPort {
  save(transfer: Transfer): Promise<Transfer>;
  findById(id: string): Promise<Transfer | undefined>;
}
