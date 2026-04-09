import { describe, expect, it } from 'vitest';
import { Account } from '../../src/entities/account';
import { ListAccountsUseCase } from '../../src/use-cases/list-accounts/list-accounts.use-case';
import { InMemoryAccountGateway } from '../in-memory-account-gateway';

function buildUseCase(gateway = new InMemoryAccountGateway()) {
  return { useCase: new ListAccountsUseCase(gateway), gateway };
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
    overrides.id ?? crypto.randomUUID(),
    overrides.owner ?? 'Alice',
    overrides.balance ?? 100,
    overrides.status ?? 'ACTIVE',
  );
  return gateway.save(account);
}

describe('ListAccountsUseCase', () => {
  it('returns an empty collection when no accounts exist', async () => {
    const { useCase } = buildUseCase();

    const output = await useCase.execute();

    expect(output.accounts).toEqual([]);
  });

  it('returns all accounts when multiple accounts exist', async () => {
    const { useCase, gateway } = buildUseCase();
    await seedAccount(gateway, { owner: 'Alice', balance: 100 });
    await seedAccount(gateway, { owner: 'Bob', balance: 200 });
    await seedAccount(gateway, { owner: 'Charlie', balance: 300 });

    const output = await useCase.execute();

    expect(output.accounts).toHaveLength(3);
    const owners = output.accounts.map((a) => a.owner);
    expect(owners).toContain('Alice');
    expect(owners).toContain('Bob');
    expect(owners).toContain('Charlie');
  });

  it('returns each account with id, owner, balance, and status', async () => {
    const { useCase, gateway } = buildUseCase();
    const savedId = '550e8400-e29b-41d4-a716-446655440000';
    await seedAccount(gateway, { id: savedId, owner: 'Alice', balance: 150 });

    const output = await useCase.execute();

    expect(output.accounts[0]).toEqual({
      id: savedId,
      owner: 'Alice',
      balance: 150,
      status: 'ACTIVE',
    });
  });

  it('returns a single account when only one exists', async () => {
    const { useCase, gateway } = buildUseCase();
    await seedAccount(gateway, { owner: 'Solo', balance: 999 });

    const output = await useCase.execute();

    expect(output.accounts).toHaveLength(1);
    expect(output.accounts[0].owner).toBe('Solo');
    expect(output.accounts[0].balance).toBe(999);
  });
});
