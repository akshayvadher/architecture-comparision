import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { TransfersService } from '../../src/transfers/transfers.service';
import { TransfersRepository } from '../../src/transfers/transfers.repository';
import { AccountsService } from '../../src/accounts/accounts.service';
import { AccountsRepository } from '../../src/accounts/accounts.repository';
import { DRIZZLE } from '../../src/database/drizzle.provider';
import { db } from '../setup';

describe('Transfer Execution', () => {
  let transfersService: TransfersService;
  let accountsService: AccountsService;
  let accountsRepository: AccountsRepository;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TransfersService,
        TransfersRepository,
        AccountsService,
        AccountsRepository,
        { provide: DRIZZLE, useValue: db },
      ],
    }).compile();

    transfersService = module.get(TransfersService);
    accountsService = module.get(AccountsService);
    accountsRepository = module.get(AccountsRepository);
  });

  describe('successful transfer', () => {
    it('debits the source account and credits the destination account by the exact amount', async () => {
      const source = await accountsService.createAccount('Alice', 500);
      const destination = await accountsService.createAccount('Bob', 200);

      await transfersService.executeTransfer(source.id, destination.id, 150);

      const updatedSource = await accountsRepository.findById(source.id);
      const updatedDestination = await accountsRepository.findById(destination.id);

      expect(parseFloat(updatedSource!.balance)).toBe(350);
      expect(parseFloat(updatedDestination!.balance)).toBe(350);
    });

    it('returns a transfer with id, source, destination, amount, timestamp, and COMPLETED status', async () => {
      const source = await accountsService.createAccount('Alice', 500);
      const destination = await accountsService.createAccount('Bob', 200);

      const transfer = await transfersService.executeTransfer(source.id, destination.id, 100);

      expect(transfer.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(transfer.fromAccountId).toBe(source.id);
      expect(transfer.toAccountId).toBe(destination.id);
      expect(transfer.amount).toBe(100);
      expect(transfer.timestamp).toBeInstanceOf(Date);
      expect(transfer.status).toBe('COMPLETED');
    });

    it('transfers the entire balance when amount equals source balance', async () => {
      const source = await accountsService.createAccount('Alice', 300);
      const destination = await accountsService.createAccount('Bob', 0);

      await transfersService.executeTransfer(source.id, destination.id, 300);

      const updatedSource = await accountsRepository.findById(source.id);
      const updatedDestination = await accountsRepository.findById(destination.id);

      expect(parseFloat(updatedSource!.balance)).toBe(0);
      expect(parseFloat(updatedDestination!.balance)).toBe(300);
    });
  });

  describe('insufficient funds', () => {
    it('rejects a transfer when source account has insufficient funds', async () => {
      const source = await accountsService.createAccount('Alice', 100);
      const destination = await accountsService.createAccount('Bob', 200);

      await expect(
        transfersService.executeTransfer(source.id, destination.id, 150),
      ).rejects.toThrow('Insufficient funds');
    });

    it('does not change either account balance when rejected for insufficient funds', async () => {
      const source = await accountsService.createAccount('Alice', 100);
      const destination = await accountsService.createAccount('Bob', 200);

      await expect(
        transfersService.executeTransfer(source.id, destination.id, 150),
      ).rejects.toThrow();

      const updatedSource = await accountsRepository.findById(source.id);
      const updatedDestination = await accountsRepository.findById(destination.id);

      expect(parseFloat(updatedSource!.balance)).toBe(100);
      expect(parseFloat(updatedDestination!.balance)).toBe(200);
    });

    it('creates a FAILED transfer record when rejected for insufficient funds', async () => {
      const source = await accountsService.createAccount('Alice', 100);
      const destination = await accountsService.createAccount('Bob', 200);

      await expect(
        transfersService.executeTransfer(source.id, destination.id, 150),
      ).rejects.toThrow();

      // Query the transfers table directly to find the FAILED record
      const { transfers } = await import('../../src/database/schema');
      const { eq } = await import('drizzle-orm');
      const rows = await (db as any)
        .select()
        .from(transfers)
        .where(eq(transfers.fromAccountId, source.id));

      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('FAILED');
      expect(parseFloat(rows[0].amount)).toBe(150);
    });
  });

  describe('invalid amount', () => {
    it('rejects a transfer of zero amount', async () => {
      const source = await accountsService.createAccount('Alice', 100);
      const destination = await accountsService.createAccount('Bob', 200);

      await expect(
        transfersService.executeTransfer(source.id, destination.id, 0),
      ).rejects.toThrow('Transfer amount must be greater than zero');
    });

    it('rejects a transfer of negative amount', async () => {
      const source = await accountsService.createAccount('Alice', 100);
      const destination = await accountsService.createAccount('Bob', 200);

      await expect(
        transfersService.executeTransfer(source.id, destination.id, -50),
      ).rejects.toThrow('Transfer amount must be greater than zero');
    });
  });

  describe('non-existent accounts', () => {
    it('returns not-found when source account does not exist', async () => {
      const destination = await accountsService.createAccount('Bob', 200);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(
        transfersService.executeTransfer(fakeId, destination.id, 50),
      ).rejects.toThrow('Source account');
    });

    it('returns not-found when destination account does not exist', async () => {
      const source = await accountsService.createAccount('Alice', 100);
      const fakeId = '00000000-0000-0000-0000-000000000000';

      await expect(
        transfersService.executeTransfer(source.id, fakeId, 50),
      ).rejects.toThrow('Destination account');
    });
  });

  describe('atomicity', () => {
    it('leaves both balances unchanged when transfer fails after insufficient funds check', async () => {
      const source = await accountsService.createAccount('Alice', 50);
      const destination = await accountsService.createAccount('Bob', 100);

      const sourceBalanceBefore = (await accountsRepository.findById(source.id))!.balance;
      const destBalanceBefore = (await accountsRepository.findById(destination.id))!.balance;

      await expect(
        transfersService.executeTransfer(source.id, destination.id, 75),
      ).rejects.toThrow();

      const sourceBalanceAfter = (await accountsRepository.findById(source.id))!.balance;
      const destBalanceAfter = (await accountsRepository.findById(destination.id))!.balance;

      expect(sourceBalanceAfter).toBe(sourceBalanceBefore);
      expect(destBalanceAfter).toBe(destBalanceBefore);
    });

    it('preserves exact balances across multiple successful transfers', async () => {
      const alice = await accountsService.createAccount('Alice', 1000);
      const bob = await accountsService.createAccount('Bob', 500);

      await transfersService.executeTransfer(alice.id, bob.id, 200);
      await transfersService.executeTransfer(bob.id, alice.id, 100);

      const aliceBalance = parseFloat((await accountsRepository.findById(alice.id))!.balance);
      const bobBalance = parseFloat((await accountsRepository.findById(bob.id))!.balance);

      // Total money in the system should be conserved: 1000 + 500 = 1500
      expect(aliceBalance + bobBalance).toBe(1500);
      expect(aliceBalance).toBe(900);
      expect(bobBalance).toBe(600);
    });
  });
});
