import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountRow } from '../../src/accounts/accounts.repository';
import type { AccountsRepository } from '../../src/accounts/accounts.repository';
import { AccountsService } from '../../src/accounts/accounts.service';

const UUID = '11111111-2222-4333-8444-555555555555';

function mockRepository() {
  return {
    insert: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    findByIdForUpdate: vi.fn(),
    updateBalance: vi.fn(),
  };
}

function makeService(repo: ReturnType<typeof mockRepository>) {
  return new AccountsService(repo as unknown as AccountsRepository);
}

describe('AccountsService — unit (repository mocked)', () => {
  let repo: ReturnType<typeof mockRepository>;
  let service: AccountsService;

  beforeEach(() => {
    repo = mockRepository();
    service = makeService(repo);
  });

  describe('createAccount — validation runs before the repository', () => {
    it('rejects an empty owner without touching the repository', async () => {
      await expect(service.createAccount('', 100)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('rejects a whitespace-only owner', async () => {
      await expect(service.createAccount('   ', 100)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('rejects a negative initial balance', async () => {
      await expect(service.createAccount('Alice', -1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.insert).not.toHaveBeenCalled();
    });
  });

  describe('createAccount — happy path', () => {
    it('persists the account and returns a typed Account', async () => {
      const persisted: AccountRow = {
        id: UUID,
        owner: 'Alice',
        balance: '100',
        status: 'ACTIVE',
      };
      repo.insert.mockResolvedValue(persisted);

      const result = await service.createAccount('Alice', 100);

      expect(repo.insert).toHaveBeenCalledTimes(1);
      const [argument] = repo.insert.mock.calls[0];
      expect(argument).toMatchObject({
        owner: 'Alice',
        balance: '100',
        status: 'ACTIVE',
      });
      expect(argument.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result).toEqual({
        id: UUID,
        owner: 'Alice',
        balance: 100,
        status: 'ACTIVE',
      });
    });

    it('accepts zero as a valid initial balance', async () => {
      repo.insert.mockResolvedValue({
        id: UUID,
        owner: 'Bob',
        balance: '0',
        status: 'ACTIVE',
      });

      const result = await service.createAccount('Bob', 0);

      expect(result.balance).toBe(0);
    });
  });

  describe('getAccountById', () => {
    it('rejects an id that is not a UUID without touching the repository', async () => {
      await expect(service.getAccountById('not-a-uuid')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the repository returns undefined', async () => {
      repo.findById.mockResolvedValue(undefined);

      await expect(service.getAccountById(UUID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.findById).toHaveBeenCalledWith(UUID);
    });

    it('returns the account with balance parsed to a number', async () => {
      repo.findById.mockResolvedValue({
        id: UUID,
        owner: 'Alice',
        balance: '250.50',
        status: 'ACTIVE',
      });

      const result = await service.getAccountById(UUID);

      expect(result).toEqual({
        id: UUID,
        owner: 'Alice',
        balance: 250.5,
        status: 'ACTIVE',
      });
    });
  });

  describe('getAllAccounts', () => {
    it('returns an empty array when the repository has no rows', async () => {
      repo.findAll.mockResolvedValue([]);

      const result = await service.getAllAccounts();

      expect(result).toEqual([]);
    });

    it('transforms every row, parsing balances to numbers', async () => {
      repo.findAll.mockResolvedValue([
        { id: UUID, owner: 'Alice', balance: '100.00', status: 'ACTIVE' },
        {
          id: '22222222-3333-4444-8555-666666666666',
          owner: 'Bob',
          balance: '42.50',
          status: 'ACTIVE',
        },
      ]);

      const result = await service.getAllAccounts();

      expect(result).toHaveLength(2);
      expect(result[0].balance).toBe(100);
      expect(result[1].balance).toBe(42.5);
    });
  });
});
