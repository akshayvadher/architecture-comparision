import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService } from '../../src/application/account.service';
import {
  AccountNotFoundError,
  InvalidIdError,
} from '../../src/domain/errors/domain-errors';
import { InMemoryAccountRepository } from '../in-memory-account-repository';

describe('Account Retrieval — Domain Tests (in-memory, no database)', () => {
  let accountService: AccountService;
  let repository: InMemoryAccountRepository;

  beforeEach(() => {
    repository = new InMemoryAccountRepository();
    accountService = new AccountService(repository);
  });

  describe('getAccountById', () => {
    it('returns the account with id, owner, balance, and status', async () => {
      const created = await accountService.createAccount('Alice', 500);

      const retrieved = await accountService.getAccountById(created.id);

      expect(retrieved).toEqual({
        id: created.id,
        owner: 'Alice',
        balance: 500,
        status: 'ACTIVE',
      });
    });

    it('throws AccountNotFoundError for a non-existent id', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(
        accountService.getAccountById(nonExistentId),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('throws InvalidIdError for an invalid id format', async () => {
      await expect(accountService.getAccountById('not-a-uuid')).rejects.toThrow(
        InvalidIdError,
      );
    });

    it('throws InvalidIdError for an empty id', async () => {
      await expect(accountService.getAccountById('')).rejects.toThrow(
        InvalidIdError,
      );
    });
  });

  describe('getAllAccounts', () => {
    it('returns an empty array when no accounts exist', async () => {
      const accounts = await accountService.getAllAccounts();

      expect(accounts).toEqual([]);
    });

    it('returns all accounts when multiple exist', async () => {
      const alice = await accountService.createAccount('Alice', 100);
      const bob = await accountService.createAccount('Bob', 200);
      const charlie = await accountService.createAccount('Charlie', 300);

      const accounts = await accountService.getAllAccounts();

      expect(accounts).toHaveLength(3);

      const ids = accounts.map((a) => a.id);
      expect(ids).toContain(alice.id);
      expect(ids).toContain(bob.id);
      expect(ids).toContain(charlie.id);
    });

    it('returns accounts with correct fields', async () => {
      await accountService.createAccount('Alice', 750);

      const accounts = await accountService.getAllAccounts();

      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toEqual(
        expect.objectContaining({
          owner: 'Alice',
          balance: 750,
          status: 'ACTIVE',
        }),
      );
      expect(accounts[0].id).toBeDefined();
    });
  });

  describe('error mapping — domain errors stay in the domain layer', () => {
    it('AccountNotFoundError carries the missing id in its message', async () => {
      const missingId = '11111111-1111-1111-1111-111111111111';

      await expect(accountService.getAccountById(missingId)).rejects.toThrow(
        `Account with id ${missingId} not found`,
      );
    });

    it('InvalidIdError carries the bad id in its message', async () => {
      await expect(accountService.getAccountById('garbage')).rejects.toThrow(
        'Invalid id format: garbage',
      );
    });
  });
});
