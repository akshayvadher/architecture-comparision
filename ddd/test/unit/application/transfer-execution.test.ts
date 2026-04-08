import { describe, it, expect, beforeEach } from 'vitest';
import { TransferService } from '../../../src/application/transfer.service';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
  InvalidBalanceError,
} from '../../../src/domain/errors/domain-errors';
import { AccountId } from '../../../src/domain/value-objects/account-id';
import { Money } from '../../../src/domain/value-objects/money';
import { Account } from '../../../src/domain/aggregates/account';
import { InMemoryAccountRepository } from '../../in-memory-account-repository';
import { InMemoryTransferRepository } from '../../in-memory-transfer-repository';
import { InMemoryUnitOfWork } from '../../in-memory-unit-of-work';

describe('TransferService — transfer execution with in-memory repositories', () => {
  let accountRepo: InMemoryAccountRepository;
  let transferRepo: InMemoryTransferRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let service: TransferService;

  let sourceId: string;
  let destId: string;

  beforeEach(async () => {
    accountRepo = new InMemoryAccountRepository();
    transferRepo = new InMemoryTransferRepository();
    unitOfWork = new InMemoryUnitOfWork(accountRepo, transferRepo);
    service = new TransferService(accountRepo, transferRepo, unitOfWork);

    const source = await accountRepo.save(
      new Account(
        AccountId.create('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
        'Alice',
        Money.create(1000),
        'ACTIVE',
      ),
    );
    sourceId = source.id.value;

    const dest = await accountRepo.save(
      new Account(
        AccountId.create('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
        'Bob',
        Money.create(500),
        'ACTIVE',
      ),
    );
    destId = dest.id.value;
  });

  describe('successful transfer', () => {
    it('debits source and credits destination by the transfer amount', async () => {
      await service.initiateTransfer(sourceId, destId, 300);

      const source = await accountRepo.findById(AccountId.create(sourceId));
      const dest = await accountRepo.findById(AccountId.create(destId));

      expect(source!.balance.value).toBe(700);
      expect(dest!.balance.value).toBe(800);
    });

    it('returns transfer with id, accounts, amount, timestamp, and COMPLETED status', async () => {
      const result = await service.initiateTransfer(sourceId, destId, 300);

      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result.fromAccountId).toBe(sourceId);
      expect(result.toAccountId).toBe(destId);
      expect(result.amount).toBe(300);
      expect(result.status).toBe('COMPLETED');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('produces a TransferCompleted domain event with correct details', async () => {
      const result = await service.initiateTransfer(sourceId, destId, 300);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('TransferCompleted');
      expect(result.events[0].data).toEqual({
        transferId: result.id,
        fromAccountId: sourceId,
        toAccountId: destId,
        amount: 300,
      });
      expect(result.events[0].timestamp).toBeInstanceOf(Date);
    });

    it('persists the completed transfer in the transfer repository', async () => {
      const result = await service.initiateTransfer(sourceId, destId, 300);

      const allTransfers = transferRepo.getAll();
      expect(allTransfers).toHaveLength(1);
      expect(allTransfers[0].id.value).toBe(result.id);
      expect(allTransfers[0].status).toBe('COMPLETED');
    });
  });

  describe('insufficient funds — aggregate rejects debit', () => {
    it('throws InsufficientFundsError when source balance is less than transfer amount', async () => {
      await expect(
        service.initiateTransfer(sourceId, destId, 1500),
      ).rejects.toThrow(InsufficientFundsError);
    });

    it('does not change either account balance on rejection', async () => {
      try {
        await service.initiateTransfer(sourceId, destId, 1500);
      } catch {
        // expected
      }

      const source = await accountRepo.findById(AccountId.create(sourceId));
      const dest = await accountRepo.findById(AccountId.create(destId));

      expect(source!.balance.value).toBe(1000);
      expect(dest!.balance.value).toBe(500);
    });

    it('persists a FAILED transfer record', async () => {
      try {
        await service.initiateTransfer(sourceId, destId, 1500);
      } catch {
        // expected
      }

      const allTransfers = transferRepo.getAll();
      expect(allTransfers).toHaveLength(1);
      expect(allTransfers[0].status).toBe('FAILED');
    });

    it('produces a TransferFailed domain event with reason', async () => {
      try {
        await service.initiateTransfer(sourceId, destId, 1500);
      } catch {
        // expected
      }

      const allTransfers = transferRepo.getAll();
      const events = allTransfers[0].domainEvents;

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('TransferFailed');
      expect((events[0].data as any).reason).toContain('Insufficient funds');
    });
  });

  describe('invalid amount — Money value object rejects', () => {
    it('rejects a negative transfer amount', async () => {
      await expect(
        service.initiateTransfer(sourceId, destId, -100),
      ).rejects.toThrow(InvalidBalanceError);
    });

    it('rejects a zero transfer amount', async () => {
      await expect(
        service.initiateTransfer(sourceId, destId, 0),
      ).rejects.toThrow(InvalidAmountError);
    });
  });

  describe('non-existent accounts', () => {
    it('returns not-found when source account does not exist', async () => {
      const fakeId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

      await expect(
        service.initiateTransfer(fakeId, destId, 100),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('returns not-found when destination account does not exist', async () => {
      const fakeId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

      await expect(
        service.initiateTransfer(sourceId, fakeId, 100),
      ).rejects.toThrow(AccountNotFoundError);
    });

    it('does not persist a transfer when source account is not found', async () => {
      const fakeId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

      try {
        await service.initiateTransfer(fakeId, destId, 100);
      } catch {
        // expected
      }

      expect(transferRepo.getAll()).toHaveLength(0);
    });
  });

  describe('orchestration — application service does not contain business rules', () => {
    it('the insufficient-funds rule is enforced by the aggregate debit, not a service-level balance check', async () => {
      // Transfer exactly the full balance — should succeed because aggregate allows debit when balance equals amount
      const result = await service.initiateTransfer(sourceId, destId, 1000);
      expect(result.status).toBe('COMPLETED');

      // Transfer 1 more — should fail because aggregate's debit rejects it
      await expect(
        service.initiateTransfer(sourceId, destId, 1),
      ).rejects.toThrow(InsufficientFundsError);
    });
  });
});
