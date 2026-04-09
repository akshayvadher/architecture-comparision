import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService } from '../../../src/application/account.service';
import {
  InvalidBalanceError,
  InvalidOwnerError,
} from '../../../src/domain/errors/domain-errors';
import { InMemoryAccountRepository } from '../../in-memory-account-repository';

describe('AccountService — account creation with in-memory repository', () => {
  let service: AccountService;
  let repository: InMemoryAccountRepository;

  beforeEach(() => {
    repository = new InMemoryAccountRepository();
    service = new AccountService(repository);
  });

  it('returns the created account with a UUID, owner, balance, and ACTIVE status', async () => {
    const result = await service.createAccount('Alice', 1000);

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(result.owner).toBe('Alice');
    expect(result.balance).toBe(1000);
    expect(result.status).toBe('ACTIVE');
  });

  it('creates an account with zero balance', async () => {
    const result = await service.createAccount('Bob', 0);

    expect(result.balance).toBe(0);
    expect(result.status).toBe('ACTIVE');
  });

  it('persists the account in the repository', async () => {
    const created = await service.createAccount('Alice', 500);

    const allAccounts = await repository.findAll();
    expect(allAccounts).toHaveLength(1);
    expect(allAccounts[0].id.value).toBe(created.id);
    expect(allAccounts[0].owner).toBe('Alice');
    expect(allAccounts[0].balance.value).toBe(500);
  });

  it('rejects a negative initial balance', async () => {
    await expect(service.createAccount('Alice', -100)).rejects.toThrow(
      InvalidBalanceError,
    );
  });

  it('rejects an empty owner name', async () => {
    await expect(service.createAccount('', 100)).rejects.toThrow(
      InvalidOwnerError,
    );
  });

  it('rejects a whitespace-only owner name', async () => {
    await expect(service.createAccount('   ', 100)).rejects.toThrow(
      InvalidOwnerError,
    );
  });

  it('does not persist when creation fails due to invalid balance', async () => {
    try {
      await service.createAccount('Alice', -100);
    } catch {
      // expected
    }

    const allAccounts = await repository.findAll();
    expect(allAccounts).toHaveLength(0);
  });

  it('does not persist when creation fails due to empty owner', async () => {
    try {
      await service.createAccount('', 100);
    } catch {
      // expected
    }

    const allAccounts = await repository.findAll();
    expect(allAccounts).toHaveLength(0);
  });
});
