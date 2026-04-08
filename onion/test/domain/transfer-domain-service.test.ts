import { describe, it, expect } from 'vitest';
import { executeTransfer } from '../../src/domain/services/transfer-domain.service';
import { Account } from '../../src/domain/model/account';
import { InsufficientFundsError } from '../../src/domain/model/errors';

function buildAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'source-id',
    owner: 'Alice',
    balance: 500,
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('Transfer domain service — executeTransfer', () => {
  it('debits the source account by the transfer amount', () => {
    const source = buildAccount({ id: 'src', balance: 500 });
    const destination = buildAccount({ id: 'dst', balance: 200 });

    const result = executeTransfer('tx-1', source, destination, 150);

    expect(result.debitedSource.balance).toBe(350);
  });

  it('credits the destination account by the transfer amount', () => {
    const source = buildAccount({ id: 'src', balance: 500 });
    const destination = buildAccount({ id: 'dst', balance: 200 });

    const result = executeTransfer('tx-1', source, destination, 150);

    expect(result.creditedDestination.balance).toBe(350);
  });

  it('returns a COMPLETED transfer with correct fields', () => {
    const source = buildAccount({ id: 'src', balance: 500 });
    const destination = buildAccount({ id: 'dst', balance: 200 });

    const result = executeTransfer('tx-1', source, destination, 100);

    expect(result.transfer).toMatchObject({
      id: 'tx-1',
      fromAccountId: 'src',
      toAccountId: 'dst',
      amount: 100,
      status: 'COMPLETED',
    });
    expect(result.transfer.timestamp).toBeInstanceOf(Date);
  });

  it('throws InsufficientFundsError when source balance is less than amount', () => {
    const source = buildAccount({ id: 'src', balance: 50 });
    const destination = buildAccount({ id: 'dst', balance: 200 });

    expect(() => executeTransfer('tx-1', source, destination, 100)).toThrow(
      InsufficientFundsError,
    );
  });

  it('does not modify account balances when funds are insufficient', () => {
    const source = buildAccount({ id: 'src', balance: 50 });
    const destination = buildAccount({ id: 'dst', balance: 200 });

    try {
      executeTransfer('tx-1', source, destination, 100);
    } catch {
      // expected
    }

    expect(source.balance).toBe(50);
    expect(destination.balance).toBe(200);
  });

  it('allows transfer of exact balance (balance equals amount)', () => {
    const source = buildAccount({ id: 'src', balance: 100 });
    const destination = buildAccount({ id: 'dst', balance: 0 });

    const result = executeTransfer('tx-1', source, destination, 100);

    expect(result.debitedSource.balance).toBe(0);
    expect(result.creditedDestination.balance).toBe(100);
    expect(result.transfer.status).toBe('COMPLETED');
  });

  it('preserves all other account fields on the debited source', () => {
    const source = buildAccount({ id: 'src', owner: 'Alice', balance: 500, status: 'ACTIVE' });
    const destination = buildAccount({ id: 'dst' });

    const result = executeTransfer('tx-1', source, destination, 100);

    expect(result.debitedSource.id).toBe('src');
    expect(result.debitedSource.owner).toBe('Alice');
    expect(result.debitedSource.status).toBe('ACTIVE');
  });

  it('preserves all other account fields on the credited destination', () => {
    const source = buildAccount({ id: 'src' });
    const destination = buildAccount({ id: 'dst', owner: 'Bob', balance: 200, status: 'ACTIVE' });

    const result = executeTransfer('tx-1', source, destination, 100);

    expect(result.creditedDestination.id).toBe('dst');
    expect(result.creditedDestination.owner).toBe('Bob');
    expect(result.creditedDestination.status).toBe('ACTIVE');
  });
});
