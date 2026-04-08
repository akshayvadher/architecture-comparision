import { Account } from '../aggregates/account';
import { AccountId } from '../value-objects/account-id';
import { Money } from '../value-objects/money';

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

export interface AccountRepository {
  save(account: Account): Promise<Account>;
  findById(id: AccountId): Promise<Account | undefined>;
  findAll(): Promise<Account[]>;
  updateBalance(id: AccountId, newBalance: Money): Promise<void>;
}
