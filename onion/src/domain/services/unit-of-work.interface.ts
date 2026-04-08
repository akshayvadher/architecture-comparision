import { AccountRepository } from './account-repository.interface';
import { TransferRepository } from './transfer-repository.interface';

export const UNIT_OF_WORK = 'UNIT_OF_WORK';

export interface UnitOfWork {
  execute<T>(
    work: (repositories: {
      accountRepository: AccountRepository;
      transferRepository: TransferRepository;
    }) => Promise<T>,
  ): Promise<T>;
}
