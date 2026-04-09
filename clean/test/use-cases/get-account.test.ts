import { describe, expect, it } from 'vitest';
import { Account } from '../../src/entities/account';
import {
  AccountNotFoundError,
  InvalidIdError,
} from '../../src/entities/errors';
import { GetAccountUseCase } from '../../src/use-cases/get-account/get-account.use-case';
import { InMemoryAccountGateway } from '../in-memory-account-gateway';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const ANOTHER_UUID = '660e8400-e29b-41d4-a716-446655440001';

function buildUseCase(gateway = new InMemoryAccountGateway()) {
  return { useCase: new GetAccountUseCase(gateway), gateway };
}

async function seedAccount(
  gateway: InMemoryAccountGateway,
  overrides: Partial<{
    id: string;
    owner: string;
    balance: number;
    status: string;
  }> = {},
) {
  const account = new Account(
    overrides.id ?? VALID_UUID,
    overrides.owner ?? 'Alice',
    overrides.balance ?? 100,
    overrides.status ?? 'ACTIVE',
  );
  return gateway.save(account);
}

describe('GetAccountUseCase', () => {
  it('returns account data when the account exists', async () => {
    const { useCase, gateway } = buildUseCase();
    await seedAccount(gateway, {
      id: VALID_UUID,
      owner: 'Alice',
      balance: 250,
    });

    const output = await useCase.execute({ accountId: VALID_UUID });

    expect(output).toEqual({
      id: VALID_UUID,
      owner: 'Alice',
      balance: 250,
      status: 'ACTIVE',
    });
  });

  it('returns id, owner, balance, and status in the output DTO', async () => {
    const { useCase, gateway } = buildUseCase();
    await seedAccount(gateway, { id: VALID_UUID, owner: 'Bob', balance: 500 });

    const output = await useCase.execute({ accountId: VALID_UUID });

    expect(output).toHaveProperty('id');
    expect(output).toHaveProperty('owner');
    expect(output).toHaveProperty('balance');
    expect(output).toHaveProperty('status');
  });

  it('throws AccountNotFoundError when the account does not exist', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ accountId: VALID_UUID })).rejects.toThrow(
      AccountNotFoundError,
    );
  });

  it('throws InvalidIdError when the id is not a valid UUID', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ accountId: 'not-a-uuid' })).rejects.toThrow(
      InvalidIdError,
    );
  });

  it('throws InvalidIdError for an empty string id', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ accountId: '' })).rejects.toThrow(
      InvalidIdError,
    );
  });

  it('throws InvalidIdError for a numeric id', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ accountId: '12345' })).rejects.toThrow(
      InvalidIdError,
    );
  });

  it('retrieves the correct account when multiple accounts exist', async () => {
    const { useCase, gateway } = buildUseCase();
    await seedAccount(gateway, {
      id: VALID_UUID,
      owner: 'Alice',
      balance: 100,
    });
    await seedAccount(gateway, {
      id: ANOTHER_UUID,
      owner: 'Bob',
      balance: 200,
    });

    const output = await useCase.execute({ accountId: ANOTHER_UUID });

    expect(output.owner).toBe('Bob');
    expect(output.balance).toBe(200);
  });
});
