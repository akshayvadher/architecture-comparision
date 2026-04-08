import { Account } from '../src/domain/aggregates/account';
import { AccountRepository } from '../src/domain/repositories/account-repository.interface';
import { AccountId } from '../src/domain/value-objects/account-id';
import { Money } from '../src/domain/value-objects/money';

export class InMemoryAccountRepository implements AccountRepository {
  private accounts = new Map<string, Account>();

  async save(account: Account): Promise<Account> {
    const reconstituted = new Account(
      AccountId.create(account.id.value),
      account.owner,
      Money.create(account.balance.value),
      account.status,
    );
    this.accounts.set(account.id.value, reconstituted);
    return reconstituted;
  }

  async findById(id: AccountId): Promise<Account | undefined> {
    const stored = this.accounts.get(id.value);
    if (!stored) return undefined;
    return new Account(
      AccountId.create(stored.id.value),
      stored.owner,
      Money.create(stored.balance.value),
      stored.status,
    );
  }

  async updateBalance(id: AccountId, newBalance: Money): Promise<void> {
    const existing = this.accounts.get(id.value);
    if (!existing) return;
    this.accounts.set(
      id.value,
      new Account(
        AccountId.create(existing.id.value),
        existing.owner,
        newBalance,
        existing.status,
      ),
    );
  }

  async findAll(): Promise<Account[]> {
    return Array.from(this.accounts.values()).map(
      (stored) =>
        new Account(
          AccountId.create(stored.id.value),
          stored.owner,
          Money.create(stored.balance.value),
          stored.status,
        ),
    );
  }
}
