import { Transfer } from '../../entities/transfer';

export const TRANSFER_GATEWAY = Symbol('TRANSFER_GATEWAY');

export interface TransferGateway {
  save(transfer: Transfer): Promise<Transfer>;
  findById(id: string): Promise<Transfer | undefined>;
}
