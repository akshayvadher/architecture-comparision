import { Transfer } from '../model/transfer';

export const TRANSFER_REPOSITORY = 'TRANSFER_REPOSITORY';

export interface TransferRepository {
  save(transfer: Transfer): Promise<Transfer>;
  findById(id: string): Promise<Transfer | undefined>;
}
