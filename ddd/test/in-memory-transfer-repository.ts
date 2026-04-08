import { Transfer } from '../src/domain/aggregates/transfer';
import { TransferRepository } from '../src/domain/repositories/transfer-repository.interface';
import { TransferId } from '../src/domain/value-objects/transfer-id';

export class InMemoryTransferRepository implements TransferRepository {
  private transfers = new Map<string, Transfer>();

  async save(transfer: Transfer): Promise<void> {
    this.transfers.set(transfer.id.value, transfer);
  }

  async findById(id: TransferId): Promise<Transfer | null> {
    return this.transfers.get(id.value) ?? null;
  }

  getAll(): Transfer[] {
    return Array.from(this.transfers.values());
  }
}
