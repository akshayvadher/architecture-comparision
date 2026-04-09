import type { Account } from '../src/domain/model/account';
import type { AccountRepository } from '../src/domain/services/account-repository.interface';

export class InMemoryAccountRepository implements AccountRepository {
  private accounts = new Map<string, Account>();

  async save(account: Account): Promise<Account> {
    this.accounts.set(account.id, { ...account });
    return { ...account };
  }

  async findById(id: string): Promise<Account | undefined> {
    const account = this.accounts.get(id);
    return account ? { ...account } : undefined;
  }

  async findAll(): Promise<Account[]> {
    return Array.from(this.accounts.values()).map((a) => ({ ...a }));
  }

  async updateBalance(id: string, newBalance: number): Promise<void> {
    const account = this.accounts.get(id);
    if (account) {
      account.balance = newBalance;
    }
  }
}
