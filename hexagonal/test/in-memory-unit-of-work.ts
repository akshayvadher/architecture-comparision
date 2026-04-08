import { AccountRepositoryPort } from '../src/domain/ports/account-repository.port';
import { TransferRepositoryPort } from '../src/domain/ports/transfer-repository.port';
import { UnitOfWork } from '../src/domain/ports/unit-of-work.port';

export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(
    private readonly accounts: AccountRepositoryPort,
    private readonly transfers: TransferRepositoryPort,
  ) {}

  async execute<T>(
    work: (repos: {
      accounts: AccountRepositoryPort;
      transfers: TransferRepositoryPort;
    }) => Promise<T>,
  ): Promise<T> {
    return work({
      accounts: this.accounts,
      transfers: this.transfers,
    });
  }
}
