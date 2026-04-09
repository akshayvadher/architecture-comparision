import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService } from '../../src/application/account.service';
import {
  InvalidBalanceError,
  InvalidOwnerError,
} from '../../src/domain/errors/domain-errors';
import { createAccount } from '../../src/domain/models/account';
import { InMemoryAccountRepository } from '../in-memory-account-repository';

describe('Account Creation — Domain Tests (in-memory, no database)', () => {
  let accountService: AccountService;
  let repository: InMemoryAccountRepository;

  beforeEach(() => {
    repository = new InMemoryAccountRepository();
    accountService = new AccountService(repository);
  });

  describe('domain entity — createAccount', () => {
    it('creates an account with ACTIVE status', () => {
      const account = createAccount('some-id', 'Alice', 100);

      expect(account).toEqual({
        id: 'some-id',
        owner: 'Alice',
        balance: 100,
        status: 'ACTIVE',
      });
    });

    it('creates an account with zero balance', () => {
      const account = createAccount('some-id', 'Bob', 0);

      expect(account.balance).toBe(0);
      expect(account.status).toBe('ACTIVE');
    });

    it('rejects a negative initial balance', () => {
      expect(() => createAccount('some-id', 'Alice', -1)).toThrow(
        InvalidBalanceError,
      );
    });

    it('rejects an empty owner name', () => {
      expect(() => createAccount('some-id', '', 100)).toThrow(
        InvalidOwnerError,
      );
    });

    it('rejects a whitespace-only owner name', () => {
      expect(() => createAccount('some-id', '   ', 100)).toThrow(
        InvalidOwnerError,
      );
    });
  });

  describe('application service — createAccount via in-memory adapter', () => {
    it('returns the created account with a UUID, owner, balance, and ACTIVE status', async () => {
      const account = await accountService.createAccount('Alice', 500);

      expect(account.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(account.owner).toBe('Alice');
      expect(account.balance).toBe(500);
      expect(account.status).toBe('ACTIVE');
    });

    it('persists the account — creating then retrieving returns the same data', async () => {
      const created = await accountService.createAccount('Alice', 250);

      const retrieved = await accountService.getAccountById(created.id);

      expect(retrieved).toEqual(created);
    });

    it('rejects a negative initial balance with InvalidBalanceError', async () => {
      await expect(accountService.createAccount('Alice', -50)).rejects.toThrow(
        InvalidBalanceError,
      );
    });

    it('rejects an empty owner name with InvalidOwnerError', async () => {
      await expect(accountService.createAccount('', 100)).rejects.toThrow(
        InvalidOwnerError,
      );
    });

    it('does not persist the account when validation fails', async () => {
      try {
        await accountService.createAccount('', 100);
      } catch {
        // expected
      }

      const allAccounts = await accountService.getAllAccounts();
      expect(allAccounts).toHaveLength(0);
    });
  });
});
