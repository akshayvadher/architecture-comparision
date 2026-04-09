import { describe, expect, it } from 'vitest';
import {
  InvalidBalanceError,
  InvalidOwnerError,
} from '../../src/entities/errors';
import { CreateAccountUseCase } from '../../src/use-cases/create-account/create-account.use-case';
import { InMemoryAccountGateway } from '../in-memory-account-gateway';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildUseCase(gateway = new InMemoryAccountGateway()) {
  return { useCase: new CreateAccountUseCase(gateway), gateway };
}

describe('CreateAccountUseCase', () => {
  it('returns output with generated UUID, owner, balance, and ACTIVE status', async () => {
    const { useCase } = buildUseCase();

    const output = await useCase.execute({ owner: 'Alice', balance: 100 });

    expect(output.id).toMatch(UUID_PATTERN);
    expect(output.owner).toBe('Alice');
    expect(output.balance).toBe(100);
    expect(output.status).toBe('ACTIVE');
  });

  it('persists the account through the gateway', async () => {
    const gateway = new InMemoryAccountGateway();
    const useCase = new CreateAccountUseCase(gateway);

    const output = await useCase.execute({ owner: 'Bob', balance: 200 });
    const persisted = await gateway.findById(output.id);

    expect(persisted).toBeDefined();
    expect(persisted?.owner).toBe('Bob');
    expect(persisted?.balance).toBe(200);
    expect(persisted?.status).toBe('ACTIVE');
  });

  it('rejects negative initial balance with InvalidBalanceError', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({ owner: 'Alice', balance: -10 }),
    ).rejects.toThrow(InvalidBalanceError);
  });

  it('rejects missing owner name with InvalidOwnerError', async () => {
    const { useCase } = buildUseCase();

    await expect(useCase.execute({ owner: '', balance: 100 })).rejects.toThrow(
      InvalidOwnerError,
    );
  });

  it('does not persist an account when validation fails', async () => {
    const gateway = new InMemoryAccountGateway();
    const useCase = new CreateAccountUseCase(gateway);

    try {
      await useCase.execute({ owner: '', balance: 100 });
    } catch {
      // expected
    }

    const all = await gateway.findAll();
    expect(all).toHaveLength(0);
  });

  it('generates unique ids for each account', async () => {
    const { useCase } = buildUseCase();

    const first = await useCase.execute({ owner: 'Alice', balance: 100 });
    const second = await useCase.execute({ owner: 'Bob', balance: 200 });

    expect(first.id).not.toBe(second.id);
  });

  it('accepts explicit input DTO and returns explicit output DTO', async () => {
    const { useCase } = buildUseCase();

    const input = { owner: 'Charlie', balance: 500 };
    const output = await useCase.execute(input);

    expect(output).toHaveProperty('id');
    expect(output).toHaveProperty('owner', 'Charlie');
    expect(output).toHaveProperty('balance', 500);
    expect(output).toHaveProperty('status', 'ACTIVE');
  });
});
