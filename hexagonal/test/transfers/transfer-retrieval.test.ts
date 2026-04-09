import { beforeEach, describe, expect, it } from 'vitest';
import { TransferService } from '../../src/application/transfer.service';
import {
  InvalidIdError,
  TransferNotFoundError,
} from '../../src/domain/errors/domain-errors';
import type { Account } from '../../src/domain/models/account';
import { InMemoryAccountRepository } from '../in-memory-account-repository';
import { InMemoryTransferRepository } from '../in-memory-transfer-repository';
import { InMemoryUnitOfWork } from '../in-memory-unit-of-work';

const ALICE_ID = '11111111-1111-1111-1111-111111111111';
const BOB_ID = '22222222-2222-2222-2222-222222222222';
const NON_EXISTENT_ID = '99999999-9999-9999-9999-999999999999';

function makeAccount(id: string, owner: string, balance: number): Account {
  return { id, owner, balance, status: 'ACTIVE' };
}

describe('Transfer Retrieval — Domain Tests (in-memory, no database)', () => {
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

  async function seedTransfer(amount: number = 200) {
    await accountRepo.save(makeAccount(ALICE_ID, 'Alice', 1000));
    await accountRepo.save(makeAccount(BOB_ID, 'Bob', 500));
    return transferService.executeTransfer(ALICE_ID, BOB_ID, amount);
  }

  describe('successful retrieval', () => {
    it('returns the transfer when given a valid existing id', async () => {
      const created = await seedTransfer();

      const retrieved = await transferService.getTransferById(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
    });

    it('includes id, source account, destination account, amount, timestamp, and status', async () => {
      const created = await seedTransfer(300);

      const retrieved = await transferService.getTransferById(created.id);

      expect(retrieved).toEqual(
        expect.objectContaining({
          id: created.id,
          fromAccountId: ALICE_ID,
          toAccountId: BOB_ID,
          amount: 300,
          status: 'COMPLETED',
        }),
      );
      expect(retrieved.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('non-existent transfer', () => {
    it('throws TransferNotFoundError when transfer does not exist', async () => {
      await expect(
        transferService.getTransferById(NON_EXISTENT_ID),
      ).rejects.toThrow(TransferNotFoundError);
    });

    it('includes the missing id in the error message', async () => {
      await expect(
        transferService.getTransferById(NON_EXISTENT_ID),
      ).rejects.toThrow(`Transfer with id ${NON_EXISTENT_ID} not found`);
    });
  });

  describe('invalid id format', () => {
    it('throws InvalidIdError for a non-UUID string', async () => {
      await expect(
        transferService.getTransferById('not-a-uuid'),
      ).rejects.toThrow(InvalidIdError);
    });

    it('throws InvalidIdError for an empty string', async () => {
      await expect(transferService.getTransferById('')).rejects.toThrow(
        InvalidIdError,
      );
    });

    it('includes the bad id in the error message', async () => {
      await expect(transferService.getTransferById('garbage')).rejects.toThrow(
        'Invalid id format: garbage',
      );
    });
  });
});
