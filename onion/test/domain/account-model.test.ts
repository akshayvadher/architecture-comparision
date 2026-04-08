import { describe, it, expect } from 'vitest';
import { createAccount } from '../../src/domain/model/account';
import { InvalidOwnerError, InvalidBalanceError } from '../../src/domain/model/errors';

describe('Account domain model', () => {
  describe('createAccount factory', () => {
    it('creates an account with id, owner, balance, and ACTIVE status', () => {
      const account = createAccount('some-id', 'Alice', 100);

      expect(account).toEqual({
        id: 'some-id',
        owner: 'Alice',
        balance: 100,
        status: 'ACTIVE',
      });
    });

    it('creates an account with zero balance', () => {
      const account = createAccount('id-1', 'Bob', 0);

      expect(account.balance).toBe(0);
      expect(account.status).toBe('ACTIVE');
    });

    it('rejects negative initial balance', () => {
      expect(() => createAccount('id-1', 'Alice', -1)).toThrow(InvalidBalanceError);
    });

    it('rejects negative balance with descriptive message', () => {
      expect(() => createAccount('id-1', 'Alice', -50)).toThrow(
        'Initial balance cannot be negative',
      );
    });

    it('rejects empty owner name', () => {
      expect(() => createAccount('id-1', '', 100)).toThrow(InvalidOwnerError);
    });

    it('rejects whitespace-only owner name', () => {
      expect(() => createAccount('id-1', '   ', 100)).toThrow(InvalidOwnerError);
    });

    it('rejects missing owner with descriptive message', () => {
      expect(() => createAccount('id-1', '', 100)).toThrow('Owner name is required');
    });

    it('preserves the provided id without modification', () => {
      const account = createAccount('my-custom-id', 'Alice', 50);

      expect(account.id).toBe('my-custom-id');
    });
  });
});
