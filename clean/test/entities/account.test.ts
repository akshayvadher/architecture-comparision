import { describe, expect, it } from 'vitest';
import { Account } from '../../src/entities/account';
import {
  InsufficientFundsError,
  InvalidBalanceError,
  InvalidOwnerError,
} from '../../src/entities/errors';

describe('Account entity', () => {
  describe('construction', () => {
    it('creates an account with id, owner, balance, and status', () => {
      const account = new Account('some-id', 'Alice', 100, 'ACTIVE');

      expect(account.id).toBe('some-id');
      expect(account.owner).toBe('Alice');
      expect(account.balance).toBe(100);
      expect(account.status).toBe('ACTIVE');
    });

    it('allows zero initial balance', () => {
      const account = new Account('id-1', 'Bob', 0, 'ACTIVE');

      expect(account.balance).toBe(0);
    });

    it('rejects negative initial balance with InvalidBalanceError', () => {
      expect(() => new Account('id-1', 'Alice', -1, 'ACTIVE')).toThrow(
        InvalidBalanceError,
      );
    });

    it('rejects negative balance with descriptive message', () => {
      expect(() => new Account('id-1', 'Alice', -50, 'ACTIVE')).toThrow(
        'Initial balance cannot be negative',
      );
    });

    it('rejects empty owner name with InvalidOwnerError', () => {
      expect(() => new Account('id-1', '', 100, 'ACTIVE')).toThrow(
        InvalidOwnerError,
      );
    });

    it('rejects whitespace-only owner name', () => {
      expect(() => new Account('id-1', '   ', 100, 'ACTIVE')).toThrow(
        InvalidOwnerError,
      );
    });

    it('rejects missing owner with descriptive message', () => {
      expect(() => new Account('id-1', '', 100, 'ACTIVE')).toThrow(
        'Owner name is required',
      );
    });

    it('preserves the provided id without modification', () => {
      const account = new Account('my-custom-id', 'Alice', 50, 'ACTIVE');

      expect(account.id).toBe('my-custom-id');
    });
  });

  describe('debit', () => {
    it('reduces the balance by the debited amount', () => {
      const account = new Account('id-1', 'Alice', 100, 'ACTIVE');

      account.debit(30);

      expect(account.balance).toBe(70);
    });

    it('allows debiting the entire balance', () => {
      const account = new Account('id-1', 'Alice', 100, 'ACTIVE');

      account.debit(100);

      expect(account.balance).toBe(0);
    });

    it('rejects debit exceeding balance with InsufficientFundsError', () => {
      const account = new Account('id-1', 'Alice', 50, 'ACTIVE');

      expect(() => account.debit(51)).toThrow(InsufficientFundsError);
    });

    it('does not change balance when debit is rejected', () => {
      const account = new Account('id-1', 'Alice', 50, 'ACTIVE');

      try {
        account.debit(100);
      } catch {
        // expected
      }

      expect(account.balance).toBe(50);
    });
  });

  describe('credit', () => {
    it('increases the balance by the credited amount', () => {
      const account = new Account('id-1', 'Alice', 100, 'ACTIVE');

      account.credit(50);

      expect(account.balance).toBe(150);
    });

    it('can credit a zero-balance account', () => {
      const account = new Account('id-1', 'Alice', 0, 'ACTIVE');

      account.credit(75);

      expect(account.balance).toBe(75);
    });
  });
});
