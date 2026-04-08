import { Transfer } from '../src/domain/model/transfer';
import { TransferRepository } from '../src/domain/services/transfer-repository.interface';

export class InMemoryTransferRepository implements TransferRepository {
  private transfers = new Map<string, Transfer>();

  async save(transfer: Transfer): Promise<Transfer> {
    const saved = { ...transfer };
    this.transfers.set(saved.id, saved);
    return { ...saved };
  }

  async findById(id: string): Promise<Transfer | undefined> {
    const transfer = this.transfers.get(id);
    return transfer ? { ...transfer } : undefined;
  }
}
