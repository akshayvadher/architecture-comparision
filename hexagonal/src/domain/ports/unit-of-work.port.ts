import { AccountRepositoryPort } from './account-repository.port';
import { TransferRepositoryPort } from './transfer-repository.port';

export const UNIT_OF_WORK = 'UNIT_OF_WORK';

export interface UnitOfWork {
  execute<T>(
    work: (repos: {
      accounts: AccountRepositoryPort;
      transfers: TransferRepositoryPort;
    }) => Promise<T>,
  ): Promise<T>;
}
