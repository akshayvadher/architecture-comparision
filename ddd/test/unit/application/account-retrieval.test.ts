import { beforeEach, describe, expect, it } from 'vitest';
import { AccountService } from '../../../src/application/account.service';
import {
  AccountNotFoundError,
  InvalidIdError,
} from '../../../src/domain/errors/domain-errors';
import { InMemoryAccountRepository } from '../../in-memory-account-repository';

describe('AccountService — account retrieval with in-memory repository', () => {
  let service: AccountService;
  let repository: InMemoryAccountRepository;

  beforeEach(() => {
    repository = new InMemoryAccountRepository();
    service = new AccountService(repository);
  });

  describe('getAccountById', () => {
    it('returns the account with id, owner, balance, and status', async () => {
      const created = await service.createAccount('Alice', 1000);

      const result = await service.getAccountById(created.id);

      expect(result).toEqual({
        id: created.id,
        owner: 'Alice',
        balance: 1000,
        status: 'ACTIVE',
      });
    });

    it('throws AccountNotFoundError when the account does not exist', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(service.getAccountById(nonExistentId)).rejects.toThrow(
        AccountNotFoundError,
      );
    });

    it('throws InvalidIdError when the id is not a valid UUID', async () => {
      await expect(service.getAccountById('not-a-uuid')).rejects.toThrow(
        InvalidIdError,
      );
    });

    it('returns the account reconstituted with value objects from the repository', async () => {
      const created = await service.createAccount('Bob', 250);

      const result = await service.getAccountById(created.id);

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result.balance).toBe(250);
      expect(result.owner).toBe('Bob');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('listAccounts', () => {
    it('returns an empty array when no accounts exist', async () => {
      const result = await service.listAccounts();

      expect(result).toEqual([]);
    });

    it('returns all accounts when multiple exist', async () => {
      await service.createAccount('Alice', 1000);
      await service.createAccount('Bob', 500);
      await service.createAccount('Charlie', 0);

      const result = await service.listAccounts();

      expect(result).toHaveLength(3);

      const owners = result.map((a) => a.owner).sort();
      expect(owners).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('returns each account with id, owner, balance, and status', async () => {
      await service.createAccount('Alice', 1000);

      const result = await service.listAccounts();

      expect(result).toHaveLength(1);
      expect(result[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result[0].owner).toBe('Alice');
      expect(result[0].balance).toBe(1000);
      expect(result[0].status).toBe('ACTIVE');
    });
  });
});
