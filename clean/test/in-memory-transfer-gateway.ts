import { Transfer } from '../src/entities/transfer';
import { TransferGateway } from '../src/use-cases/gateways/transfer.gateway';

export class InMemoryTransferGateway implements TransferGateway {
  private transfers = new Map<string, Transfer>();

  async save(transfer: Transfer): Promise<Transfer> {
    const copy = new Transfer(
      transfer.id,
      transfer.fromAccountId,
      transfer.toAccountId,
      transfer.amount,
      transfer.timestamp,
      transfer.status,
    );
    this.transfers.set(transfer.id, copy);
    return new Transfer(
      transfer.id,
      transfer.fromAccountId,
      transfer.toAccountId,
      transfer.amount,
      transfer.timestamp,
      transfer.status,
    );
  }

  async findById(id: string): Promise<Transfer | undefined> {
    const transfer = this.transfers.get(id);
    if (!transfer) return undefined;
    return new Transfer(
      transfer.id,
      transfer.fromAccountId,
      transfer.toAccountId,
      transfer.amount,
      transfer.timestamp,
      transfer.status,
    );
  }

  findAll(): Transfer[] {
    return Array.from(this.transfers.values());
  }
}
