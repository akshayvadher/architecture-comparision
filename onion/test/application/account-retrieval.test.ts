import { describe, it, expect } from 'vitest';
import { AccountService } from '../../src/application/account.service';
import { InMemoryAccountRepository } from '../in-memory-account-repository';
import { AccountNotFoundError, InvalidIdError } from '../../src/domain/model/errors';

function buildAccountService(repository = new InMemoryAccountRepository()) {
  return { service: new AccountService(repository), repository };
}

describe('AccountService — account retrieval by id', () => {
  it('retrieves an account by its id', async () => {
    const { service } = buildAccountService();
    const created = await service.createAccount('Alice', 100);

    const retrieved = await service.getAccountById(created.id);

    expect(retrieved).toEqual(created);
  });

  it('returns id, owner, balance, and status on the retrieved account', async () => {
    const { service } = buildAccountService();
    const created = await service.createAccount('Bob', 250);

    const retrieved = await service.getAccountById(created.id);

    expect(retrieved).toHaveProperty('id');
    expect(retrieved).toHaveProperty('owner', 'Bob');
    expect(retrieved).toHaveProperty('balance', 250);
    expect(retrieved).toHaveProperty('status', 'ACTIVE');
  });

  it('throws AccountNotFoundError for a non-existent id', async () => {
    const { service } = buildAccountService();

    await expect(
      service.getAccountById('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(AccountNotFoundError);
  });

  it('throws InvalidIdError for an invalid id format', async () => {
    const { service } = buildAccountService();

    await expect(service.getAccountById('not-a-uuid')).rejects.toThrow(
      InvalidIdError,
    );
  });

  it('throws InvalidIdError for an empty id', async () => {
    const { service } = buildAccountService();

    await expect(service.getAccountById('')).rejects.toThrow(InvalidIdError);
  });
});

describe('AccountService — list all accounts', () => {
  it('returns an empty array when no accounts exist', async () => {
    const { service } = buildAccountService();

    const accounts = await service.getAllAccounts();

    expect(accounts).toEqual([]);
  });

  it('returns all accounts when multiple exist', async () => {
    const { service } = buildAccountService();
    const alice = await service.createAccount('Alice', 100);
    const bob = await service.createAccount('Bob', 200);
    const charlie = await service.createAccount('Charlie', 300);

    const accounts = await service.getAllAccounts();

    expect(accounts).toHaveLength(3);
    expect(accounts).toEqual(expect.arrayContaining([alice, bob, charlie]));
  });

  it('returns a single account when only one exists', async () => {
    const { service } = buildAccountService();
    const created = await service.createAccount('Alice', 100);

    const accounts = await service.getAllAccounts();

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toEqual(created);
  });
});
