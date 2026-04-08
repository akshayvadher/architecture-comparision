import { Account } from '../src/entities/account';
import { AccountGateway } from '../src/use-cases/gateways/account.gateway';

export class InMemoryAccountGateway implements AccountGateway {
  private accounts = new Map<string, Account>();

  async save(account: Account): Promise<Account> {
    const copy = new Account(
      account.id,
      account.owner,
      account.balance,
      account.status,
    );
    this.accounts.set(account.id, copy);
    return new Account(account.id, account.owner, account.balance, account.status);
  }

  async findById(id: string): Promise<Account | undefined> {
    const account = this.accounts.get(id);
    if (!account) return undefined;
    return new Account(account.id, account.owner, account.balance, account.status);
  }

  async findAll(): Promise<Account[]> {
    return Array.from(this.accounts.values()).map(
      (a) => new Account(a.id, a.owner, a.balance, a.status),
    );
  }

  async updateBalance(id: string, newBalance: number): Promise<void> {
    const account = this.accounts.get(id);
    if (account) {
      const updated = new Account(account.id, account.owner, newBalance, account.status);
      this.accounts.set(id, updated);
    }
  }
}
