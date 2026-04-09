import type { AccountRepository } from '../src/domain/services/account-repository.interface';
import type { TransferRepository } from '../src/domain/services/transfer-repository.interface';
import type { UnitOfWork } from '../src/domain/services/unit-of-work.interface';

export class InMemoryUnitOfWork implements UnitOfWork {
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly transferRepository: TransferRepository,
  ) {}

  async execute<T>(
    work: (repositories: {
      accountRepository: AccountRepository;
      transferRepository: TransferRepository;
    }) => Promise<T>,
  ): Promise<T> {
    return work({
      accountRepository: this.accountRepository,
      transferRepository: this.transferRepository,
    });
  }
}
