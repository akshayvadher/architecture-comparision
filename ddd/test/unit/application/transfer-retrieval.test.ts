import { beforeEach, describe, expect, it } from 'vitest';
import { TransferService } from '../../../src/application/transfer.service';
import { Account } from '../../../src/domain/aggregates/account';
import { Transfer } from '../../../src/domain/aggregates/transfer';
import {
  InvalidIdError,
  TransferNotFoundError,
} from '../../../src/domain/errors/domain-errors';
import { AccountId } from '../../../src/domain/value-objects/account-id';
import { Money } from '../../../src/domain/value-objects/money';
import { TransferId } from '../../../src/domain/value-objects/transfer-id';
import { InMemoryAccountRepository } from '../../in-memory-account-repository';
import { InMemoryTransferRepository } from '../../in-memory-transfer-repository';
import { InMemoryUnitOfWork } from '../../in-memory-unit-of-work';

describe('TransferService — transfer retrieval with in-memory repositories', () => {
  let accountRepo: InMemoryAccountRepository;
  let transferRepo: InMemoryTransferRepository;
  let unitOfWork: InMemoryUnitOfWork;
  let service: TransferService;

  const sourceAccountId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const destAccountId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const transferUuid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  beforeEach(async () => {
    accountRepo = new InMemoryAccountRepository();
    transferRepo = new InMemoryTransferRepository();
    unitOfWork = new InMemoryUnitOfWork(accountRepo, transferRepo);
    service = new TransferService(accountRepo, transferRepo, unitOfWork);

    await accountRepo.save(
      new Account(
        AccountId.create(sourceAccountId),
        'Alice',
        Money.create(1000),
        'ACTIVE',
      ),
    );

    await accountRepo.save(
      new Account(
        AccountId.create(destAccountId),
        'Bob',
        Money.create(500),
        'ACTIVE',
      ),
    );
  });

  describe('retrieving a completed transfer', () => {
    it('returns transfer with id, source account, destination account, amount, timestamp, and status', async () => {
      const timestamp = new Date('2026-01-15T10:00:00Z');
      const completedTransfer = Transfer.completed(
        TransferId.create(transferUuid),
        AccountId.create(sourceAccountId),
        AccountId.create(destAccountId),
        Money.create(300),
        timestamp,
      );
      await transferRepo.save(completedTransfer);

      const result = await service.getTransferById(transferUuid);

      expect(result.id).toBe(transferUuid);
      expect(result.fromAccountId).toBe(sourceAccountId);
      expect(result.toAccountId).toBe(destAccountId);
      expect(result.amount).toBe(300);
      expect(result.timestamp).toEqual(timestamp);
      expect(result.status).toBe('COMPLETED');
    });

    it('includes a TransferCompleted domain event with correct details', async () => {
      const timestamp = new Date('2026-01-15T10:00:00Z');
      const completedTransfer = Transfer.completed(
        TransferId.create(transferUuid),
        AccountId.create(sourceAccountId),
        AccountId.create(destAccountId),
        Money.create(300),
        timestamp,
      );
      await transferRepo.save(completedTransfer);

      const result = await service.getTransferById(transferUuid);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('TransferCompleted');
      expect(result.events[0].data).toEqual({
        transferId: transferUuid,
        fromAccountId: sourceAccountId,
        toAccountId: destAccountId,
        amount: 300,
      });
      expect(result.events[0].timestamp).toEqual(timestamp);
    });
  });

  describe('retrieving a failed transfer', () => {
    it('returns transfer with FAILED status', async () => {
      const timestamp = new Date('2026-01-15T10:00:00Z');
      const failedTransfer = Transfer.failed(
        TransferId.create(transferUuid),
        AccountId.create(sourceAccountId),
        AccountId.create(destAccountId),
        Money.create(5000),
        timestamp,
        'Insufficient funds in account aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      );
      await transferRepo.save(failedTransfer);

      const result = await service.getTransferById(transferUuid);

      expect(result.id).toBe(transferUuid);
      expect(result.status).toBe('FAILED');
      expect(result.amount).toBe(5000);
    });

    it('includes a TransferFailed domain event with the failure reason', async () => {
      const timestamp = new Date('2026-01-15T10:00:00Z');
      const reason =
        'Insufficient funds in account aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const failedTransfer = Transfer.failed(
        TransferId.create(transferUuid),
        AccountId.create(sourceAccountId),
        AccountId.create(destAccountId),
        Money.create(5000),
        timestamp,
        reason,
      );
      await transferRepo.save(failedTransfer);

      const result = await service.getTransferById(transferUuid);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('TransferFailed');
      expect(result.events[0].data).toEqual({
        transferId: transferUuid,
        fromAccountId: sourceAccountId,
        toAccountId: destAccountId,
        amount: 5000,
        reason,
      });
      expect(result.events[0].timestamp).toEqual(timestamp);
    });
  });

  describe('non-existent transfer', () => {
    it('throws TransferNotFoundError when transfer does not exist', async () => {
      const nonExistentId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

      await expect(service.getTransferById(nonExistentId)).rejects.toThrow(
        TransferNotFoundError,
      );
    });
  });

  describe('invalid transfer id format', () => {
    it('throws InvalidIdError when id is not a valid UUID', async () => {
      await expect(service.getTransferById('not-a-uuid')).rejects.toThrow(
        InvalidIdError,
      );
    });

    it('throws InvalidIdError when id is empty', async () => {
      await expect(service.getTransferById('')).rejects.toThrow(InvalidIdError);
    });
  });

  describe('round-trip through initiateTransfer then getTransferById', () => {
    it('retrieves the same transfer that was created via initiateTransfer', async () => {
      const created = await service.initiateTransfer(
        sourceAccountId,
        destAccountId,
        250,
      );

      const retrieved = await service.getTransferById(created.id);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.fromAccountId).toBe(sourceAccountId);
      expect(retrieved.toAccountId).toBe(destAccountId);
      expect(retrieved.amount).toBe(250);
      expect(retrieved.status).toBe('COMPLETED');
      expect(retrieved.events).toHaveLength(1);
      expect(retrieved.events[0].type).toBe('TransferCompleted');
    });
  });
});
