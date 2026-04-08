import { AccountRepository } from '../src/domain/repositories/account-repository.interface';
import { TransferRepository } from '../src/domain/repositories/transfer-repository.interface';
import { UnitOfWork } from '../src/domain/repositories/unit-of-work.interface';

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
