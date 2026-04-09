import type { Account } from '../src/domain/models/account';
import type { AccountRepositoryPort } from '../src/domain/ports/account-repository.port';

export class InMemoryAccountRepository implements AccountRepositoryPort {
  private accounts: Map<string, Account> = new Map();

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
      this.accounts.set(id, { ...account, balance: newBalance });
    }
  }

  clear(): void {
    this.accounts.clear();
  }
}
