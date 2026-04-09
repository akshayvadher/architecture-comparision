import type { Transfer } from '../src/domain/models/transfer';
import type { TransferRepositoryPort } from '../src/domain/ports/transfer-repository.port';

export class InMemoryTransferRepository implements TransferRepositoryPort {
  private transfers: Map<string, Transfer> = new Map();

  async save(transfer: Transfer): Promise<Transfer> {
    const stored = { ...transfer };
    this.transfers.set(transfer.id, stored);
    return { ...stored };
  }

  async findById(id: string): Promise<Transfer | undefined> {
    const transfer = this.transfers.get(id);
    return transfer ? { ...transfer } : undefined;
  }

  clear(): void {
    this.transfers.clear();
  }
}
