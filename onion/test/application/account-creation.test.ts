import { describe, it, expect } from 'vitest';
import { AccountService } from '../../src/application/account.service';
import { InMemoryAccountRepository } from '../in-memory-account-repository';
import { InvalidOwnerError, InvalidBalanceError } from '../../src/domain/model/errors';

function buildAccountService(repository = new InMemoryAccountRepository()) {
  return { service: new AccountService(repository), repository };
}

describe('AccountService — account creation', () => {
  it('creates an account with a generated UUID, owner, balance, and ACTIVE status', async () => {
    const { service } = buildAccountService();

    const account = await service.createAccount('Alice', 100);

    expect(account.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(account.owner).toBe('Alice');
    expect(account.balance).toBe(100);
    expect(account.status).toBe('ACTIVE');
  });

  it('persists the account so it can be retrieved later', async () => {
    const { service } = buildAccountService();

    const created = await service.createAccount('Bob', 200);
    const retrieved = await service.getAccountById(created.id);

    expect(retrieved).toEqual(created);
  });

  it('rejects negative initial balance with InvalidBalanceError', async () => {
    const { service } = buildAccountService();

    await expect(service.createAccount('Alice', -10)).rejects.toThrow(InvalidBalanceError);
  });

  it('rejects missing owner name with InvalidOwnerError', async () => {
    const { service } = buildAccountService();

    await expect(service.createAccount('', 100)).rejects.toThrow(InvalidOwnerError);
  });

  it('does not persist an account when validation fails', async () => {
    const repository = new InMemoryAccountRepository();
    const service = new AccountService(repository);

    try {
      await service.createAccount('', 100);
    } catch {
      // expected
    }

    const all = await repository.findAll();
    expect(all).toHaveLength(0);
  });

  it('generates unique ids for each account', async () => {
    const { service } = buildAccountService();

    const first = await service.createAccount('Alice', 100);
    const second = await service.createAccount('Bob', 200);

    expect(first.id).not.toBe(second.id);
  });
});
