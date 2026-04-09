import { describe, expect, it } from 'vitest';
import { TransferService } from '../../src/application/transfer.service';
import {
  InvalidIdError,
  TransferNotFoundError,
} from '../../src/domain/model/errors';
import { createCompletedTransfer } from '../../src/domain/model/transfer';
import { InMemoryAccountRepository } from '../in-memory-account-repository';
import { InMemoryTransferRepository } from '../in-memory-transfer-repository';
import { InMemoryUnitOfWork } from '../in-memory-unit-of-work';

function buildTransferService() {
  const accountRepository = new InMemoryAccountRepository();
  const transferRepository = new InMemoryTransferRepository();
  const unitOfWork = new InMemoryUnitOfWork(
    accountRepository,
    transferRepository,
  );
  const service = new TransferService(
    unitOfWork,
    transferRepository,
    accountRepository,
  );
  return { service, accountRepository, transferRepository };
}

describe('TransferService — transfer retrieval by id', () => {
  it('retrieves a transfer by its id', async () => {
    const { service, transferRepository } = buildTransferService();
    const transfer = createCompletedTransfer(
      '11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      150,
    );
    await transferRepository.save(transfer);

    const retrieved = await service.getTransferById(transfer.id);

    expect(retrieved).toEqual(transfer);
  });

  it('returns id, source account, destination account, amount, timestamp, and status', async () => {
    const { service, transferRepository } = buildTransferService();
    const transfer = createCompletedTransfer(
      '22222222-2222-2222-2222-222222222222',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      300,
    );
    await transferRepository.save(transfer);

    const retrieved = await service.getTransferById(transfer.id);

    expect(retrieved).toHaveProperty('id', transfer.id);
    expect(retrieved).toHaveProperty(
      'fromAccountId',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
    expect(retrieved).toHaveProperty(
      'toAccountId',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    );
    expect(retrieved).toHaveProperty('amount', 300);
    expect(retrieved).toHaveProperty('timestamp');
    expect(retrieved).toHaveProperty('status', 'COMPLETED');
  });

  it('throws TransferNotFoundError for a non-existent transfer id', async () => {
    const { service } = buildTransferService();

    await expect(
      service.getTransferById('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(TransferNotFoundError);
  });

  it('throws InvalidIdError for an invalid id format', async () => {
    const { service } = buildTransferService();

    await expect(service.getTransferById('not-a-uuid')).rejects.toThrow(
      InvalidIdError,
    );
  });

  it('throws InvalidIdError for an empty id', async () => {
    const { service } = buildTransferService();

    await expect(service.getTransferById('')).rejects.toThrow(InvalidIdError);
  });
});
