import type { Account } from '../../entities/account';

export const ACCOUNT_GATEWAY = Symbol('ACCOUNT_GATEWAY');

export interface AccountGateway {
  save(account: Account): Promise<Account>;
  findById(id: string): Promise<Account | undefined>;
  findAll(): Promise<Account[]>;
  updateBalance(id: string, newBalance: number): Promise<void>;
}
