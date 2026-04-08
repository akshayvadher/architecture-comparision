import { describe, it, expect } from 'vitest';
import { GetTransferUseCase } from '../../src/use-cases/get-transfer/get-transfer.use-case';
import { InMemoryTransferGateway } from '../in-memory-transfer-gateway';
import { InvalidIdError, TransferNotFoundError } from '../../src/entities/errors';
import { Transfer } from '../../src/entities/transfer';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const ANOTHER_UUID = '660e8400-e29b-41d4-a716-446655440001';
const SOURCE_UUID = '770e8400-e29b-41d4-a716-446655440002';
const DEST_UUID = '880e8400-e29b-41d4-a716-446655440003';

function buildUseCase(gateway = new InMemoryTransferGateway()) {
  return { useCase: new GetTransferUseCase(gateway), gateway };
}

async function seedTransfer(
  gateway: InMemoryTransferGateway,
  overrides: Partial<{
    id: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    timestamp: Date;
    status: string;
  }> = {},
) {
  const transfer = new Transfer(
    overrides.id ?? VALID_UUID,
    overrides.fromAccountId ?? SOURCE_UUID,
    overrides.toAccountId ?? DEST_UUID,
    overrides.amount ?? 100,
    overrides.timestamp ?? new Date('2025-01-15T10:30:00Z'),
    overrides.status ?? 'COMPLETED',
  );
  return gateway.save(transfer);
}

describe('GetTransferUseCase', () => {
  it('returns transfer data when the transfer exists', async () => {
    const { useCase, gateway } = buildUseCase();
    const timestamp = new Date('2025-01-15T10:30:00Z');
    await seedTransfer(gateway, {
      id: VALID_UUID,
      fromAccountId: SOURCE_UUID,
      toAccountId: DEST_UUID,
      amount: 250,
      timestamp,
      status: 'COMPLETED',
    });

    const output = await useCase.execute({ transferId: VALID_UUID });

    expect(output).toEqual({
      id: VALID_UUID,
      fromAccountId: SOURCE_UUID,
      toAccountId: DEST_UUID,
      amount: 250,
      timestamp,
      status: 'COMPLETED',
    });
  });

  it('returns id, fromAccountId, toAccountId, amount, timestamp, and status in the output DTO', async () => {
    const { useCase, gateway } = buildUseCase();
    await seedTransfer(gateway);

    const output = await useCase.execute({ transferId: VALID_UUID });

    expect(output).toHaveProperty('id');
    expect(output).toHaveProperty('fromAccountId');
    expect(output).toHaveProperty('toAccountId');
    expect(output).toHaveProperty('amount');
    expect(output).toHaveProperty('timestamp');
    expect(output).toHaveProperty('status');
  });

  it('returns a FAILED transfer when the stored status is FAILED', async () => {
    const { useCase, gateway } = buildUseCase();
    await seedTransfer(gateway, { id: VALID_UUID, status: 'FAILED' });

    const output = await useCase.execute({ transferId: VALID_UUID });

    expect(output.status).toBe('FAILED');
  });

  it('throws TransferNotFoundError when the transfer does not exist', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ transferId: VALID_UUID }),
    ).rejects.toThrow(TransferNotFoundError);
  });

  it('throws InvalidIdError when the id is not a valid UUID', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ transferId: 'not-a-uuid' }),
    ).rejects.toThrow(InvalidIdError);
  });

  it('throws InvalidIdError for an empty string id', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ transferId: '' }),
    ).rejects.toThrow(InvalidIdError);
  });

  it('throws InvalidIdError for a numeric id', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ transferId: '12345' }),
    ).rejects.toThrow(InvalidIdError);
  });

  it('retrieves the correct transfer when multiple transfers exist', async () => {
    const { useCase, gateway } = buildUseCase();
    await seedTransfer(gateway, { id: VALID_UUID, amount: 100 });
    await seedTransfer(gateway, { id: ANOTHER_UUID, amount: 500 });

    const output = await useCase.execute({ transferId: ANOTHER_UUID });

    expect(output.id).toBe(ANOTHER_UUID);
    expect(output.amount).toBe(500);
  });
});
