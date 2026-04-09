import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AccountsRepository } from '../../src/accounts/accounts.repository';
import { AccountsService } from '../../src/accounts/accounts.service';
import { DRIZZLE } from '../../src/database/drizzle.provider';
import { db } from '../setup';

describe('Account Retrieval', () => {
  let accountsService: AccountsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AccountsService,
        AccountsRepository,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    accountsService = module.get(AccountsService);
  });

  describe('get account by id', () => {
    it('retrieves an account by its id', async () => {
      const created = await accountsService.createAccount('Alice', 100);

      const found = await accountsService.getAccountById(created.id);

      expect(found.id).toBe(created.id);
      expect(found.owner).toBe('Alice');
      expect(found.balance).toBe(100);
      expect(found.status).toBe('ACTIVE');
    });

    it('throws not-found error for a non-existent account id', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(
        accountsService.getAccountById(nonExistentId),
      ).rejects.toThrow(
        'Account with id 00000000-0000-0000-0000-000000000000 not found',
      );
    });

    it('throws error for an invalid id format', async () => {
      await expect(
        accountsService.getAccountById('not-a-uuid'),
      ).rejects.toThrow('Invalid account id format');
    });

    it('throws error for an empty id', async () => {
      await expect(accountsService.getAccountById('')).rejects.toThrow(
        'Invalid account id format',
      );
    });
  });

  describe('list all accounts', () => {
    it('returns an empty array when no accounts exist', async () => {
      const accounts = await accountsService.getAllAccounts();

      expect(accounts).toEqual([]);
    });

    it('returns all accounts when multiple exist', async () => {
      await accountsService.createAccount('Alice', 100);
      await accountsService.createAccount('Bob', 200);
      await accountsService.createAccount('Charlie', 300);

      const accounts = await accountsService.getAllAccounts();

      expect(accounts).toHaveLength(3);

      const owners = accounts.map((a) => a.owner).sort();
      expect(owners).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('returns a single account when only one exists', async () => {
      await accountsService.createAccount('Alice', 500);

      const accounts = await accountsService.getAllAccounts();

      expect(accounts).toHaveLength(1);
      expect(accounts[0].owner).toBe('Alice');
      expect(accounts[0].balance).toBe(500);
      expect(accounts[0].status).toBe('ACTIVE');
    });

    it('returns each account with id, owner, balance, and status', async () => {
      await accountsService.createAccount('Alice', 100);

      const accounts = await accountsService.getAllAccounts();

      expect(accounts[0]).toEqual(
        expect.objectContaining({
          id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
          ),
          owner: 'Alice',
          balance: 100,
          status: 'ACTIVE',
        }),
      );
    });
  });
});
