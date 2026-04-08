import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { AccountsService } from '../../src/accounts/accounts.service';
import { AccountsRepository } from '../../src/accounts/accounts.repository';
import { DRIZZLE } from '../../src/database/drizzle.provider';
import { db } from '../setup';

describe('Account Creation', () => {
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

  it('creates an account with a valid owner and initial balance', async () => {
    const account = await accountsService.createAccount('Alice', 100);

    expect(account.owner).toBe('Alice');
    expect(account.balance).toBe(100);
    expect(account.status).toBe('ACTIVE');
    expect(account.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('creates an account with zero initial balance', async () => {
    const account = await accountsService.createAccount('Bob', 0);

    expect(account.owner).toBe('Bob');
    expect(account.balance).toBe(0);
    expect(account.status).toBe('ACTIVE');
  });

  it('rejects account creation with a negative initial balance', async () => {
    await expect(
      accountsService.createAccount('Charlie', -50),
    ).rejects.toThrow('Initial balance cannot be negative');
  });

  it('rejects account creation without an owner name', async () => {
    await expect(
      accountsService.createAccount('', 100),
    ).rejects.toThrow('Owner name is required');
  });

  it('rejects account creation when owner name is only whitespace', async () => {
    await expect(
      accountsService.createAccount('   ', 100),
    ).rejects.toThrow('Owner name is required');
  });

  it('persists the created account in the database', async () => {
    const created = await accountsService.createAccount('Diana', 250);

    const repository = new AccountsRepository(db as any);
    const found = await repository.findById(created.id);

    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.owner).toBe('Diana');
    expect(parseFloat(found!.balance)).toBe(250);
    expect(found!.status).toBe('ACTIVE');
  });
});
