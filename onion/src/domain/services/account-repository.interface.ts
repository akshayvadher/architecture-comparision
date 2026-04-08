import { Account } from '../model/account';

export const ACCOUNT_REPOSITORY = 'ACCOUNT_REPOSITORY';

export interface AccountRepository {
  save(account: Account): Promise<Account>;
  findById(id: string): Promise<Account | undefined>;
  findAll(): Promise<Account[]>;
  updateBalance(id: string, newBalance: number): Promise<void>;
}
