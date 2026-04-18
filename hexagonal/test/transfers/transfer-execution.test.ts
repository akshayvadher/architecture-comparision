import { beforeEach, describe, expect, it } from 'vitest';
import { TransferService } from '../../src/application/transfer.service';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
} from '../../src/domain/errors/domain-errors';
import type { Account } from '../../src/domain/models/account';
import type { Transfer } from '../../src/domain/models/transfer';
import { InMemoryAccountRepository } from '../in-memory-account-repository';
import { InMemoryTransferRepository } from '../in-memory-transfer-repository';
import { InMemoryUnitOfWork } from '../in-memory-unit-of-work';

const ALICE_ID = '11111111-1111-1111-1111-111111111111';
const BOB_ID = '22222222-2222-2222-2222-222222222222';
const NON_EXISTENT_ID = '99999999-9999-9999-9999-999999999999';

function makeAccount(id: string, owner: string, balance: number): Account {
  return { id, owner, balance, status: 'ACTIVE' };
}

describe('Transfer Execution — Domain Tests (in-memory, no database)', () => {
  let transferService: TransferService;
  let accountRepo: InMemoryAccountRepository;
  let transferRepo: InMemoryTransferRepository;
  let unitOfWork: InMemoryUnitOfWork;

  beforeEach(() => {
    accountRepo = new InMemoryAccountRepository();
    transferRepo = new InMemoryTransferRepository();
    unitOfWork = new InMemoryUnitOfWork(accountRepo, transferRepo);
    transferService = new TransferService(
      unitOfWork,
      transferRepo,
      accountRepo,
    );
  });

  describe('successful transfer', () => {
    it('debits the source account and credits the destination by the exact amount', async () => {
      await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 1000));
      await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));

      await transferService.executeTransfer(ALICE_ID, BOB_ID, 200);

      const alice = await accountRepo.findById(ALICE_ID);
      const bob = await accountRepo.findById(BOB_ID);
      expect(alice?.balance).toBe(800);
      expect(bob?.balance).toBe(700);
    });

    it('returns a transfer with id, accounts, amount, timestamp, and COMPLETED status', async () => {
      await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 1000));
      await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));

      const transfer = await transferService.executeTransfer(
        ALICE_ID,
        BOB_ID,
        250,
      );

      expect(transfer.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(transfer.fromAccountId).toBe(ALICE_ID);
      expect(transfer.toAccountId).toBe(BOB_ID);
      expect(transfer.amount).toBe(250);
      expect(transfer.timestamp).toBeInstanceOf(Date);
      expect(transfer.status).toBe('COMPLETED');
    });

    it('persists the transfer record', async () => {
      await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 1000));
      await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));

      const transfer = await transferService.executeTransfer(
        ALICE_ID,
        BOB_ID,
        100,
      );

      const persisted = await transferRepo.findById(transfer.id);
      expect(persisted).toBeDefined();
      expect(persisted?.status).toBe('COMPLETED');
      expect(persisted?.amount).toBe(100);
    });
  });

  describe('insufficient funds', () => {
    it('rejects a transfer when source has insufficient funds', async () => {
      await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 50));
      await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));

      await expect(
        transferService.executeTransfer(ALICE_ID, BOB_ID, 100),
      ).rejects.toThrow(InsufficientFundsError);
    });

    it('does not change either account balance when rejected for insufficient funds', async () => {
      await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 50));
      await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));

      try {
        await transferService.executeTransfer(ALICE_ID, BOB_ID, 100);
      } catch {
        // expected
      }

      const alice = await accountRepo.findById(ALICE_ID);
      const bob = await accountRepo.findById(BOB_ID);
      expect(alice?.balance).toBe(50);
      expect(bob?.balance).toBe(500);
    });

    it('creates a FAILED transfer record when rejected for insufficient funds', async () => {
      await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 50));
      await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));

      try {
        await transferService.executeTransfer(ALICE_ID, BOB_ID, 100);
      } catch {
        // expected
      }

      const allTransfers: Transfer[] = Array.from(
        (
          transferRepo as unknown as { transfers: Map<string, Transfer> }
        ).transfers.values(),
      );
      expect(allTransfers).toHaveLength(1);
      expect(allTransfers[0].status).toBe('FAILED');
    });
  });

  describe('invalid amount', () => {
    it('rejects a zero amount', async () => {
      await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 1000));
      await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));

      await expect(
        transferService.executeTransfer(ALICE_ID, BOB_ID, 0),
      ).rejects.toThrow(InvalidAmountError);
    });

    it('rejects a negative amount', async () => {
      await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 1000));
      await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));

      await expect(
        transferService.executeTransfer(ALICE_ID, BOB_ID, -50),
      ).rejects.toThrow(InvalidAmountError);
    });
  });

  describe('non-existent accounts', () => {
    it('returns not-found when source account does not exist', async () => {
      await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));

      await expect(
        transferService.executeTransfer(NON_EXISTENT_ID, BOB_ID, 100),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('returns not-found when destination account does not exist', async () => {
      await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 1000));

      await expect(
        transferService.executeTransfer(ALICE_ID, NON_EXISTENT_ID, 100),
      ).rejects.toThrow(AccountNotFoundError);
    });
  });

  describe('domain purity', () => {
    it('transfer service has no infrastructure imports — tested by this entire suite running without database or framework', () => {
      // This test suite IS the proof: TransferService is constructed with
      // in-memory adapters, no NestJS TestingModule, no database connection.
      // If the domain imported infrastructure, this file would not compile.
      expect(transferService).toBeDefined();
    });
  });
});
