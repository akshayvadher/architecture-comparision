import { describe, it, expect } from 'vitest';
import { Account } from '../../../src/domain/aggregates/account';
import { AccountId } from '../../../src/domain/value-objects/account-id';
import { Money } from '../../../src/domain/value-objects/money';
import {
  InvalidOwnerError,
  InsufficientFundsError,
} from '../../../src/domain/errors/domain-errors';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function createAccountId(uuid: string = VALID_UUID): AccountId {
  return AccountId.create(uuid);
}

function createMoney(amount: number): Money {
  return Money.create(amount);
}

describe('Account aggregate', () => {
  describe('creation invariants', () => {
    it('creates an account with id, owner, balance, and status', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(1000),
        'ACTIVE',
      );

      expect(account.id.value).toBe(VALID_UUID);
      expect(account.owner).toBe('Alice');
      expect(account.balance.value).toBe(1000);
      expect(account.status).toBe('ACTIVE');
    });

    it('allows creation with zero balance', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(0),
        'ACTIVE',
      );

      expect(account.balance.value).toBe(0);
    });

    it('rejects an empty owner name', () => {
      expect(
        () => new Account(createAccountId(), '', createMoney(100), 'ACTIVE'),
      ).toThrow(InvalidOwnerError);
    });

    it('rejects a whitespace-only owner name', () => {
      expect(
        () => new Account(createAccountId(), '   ', createMoney(100), 'ACTIVE'),
      ).toThrow(InvalidOwnerError);
    });
  });

  describe('debit', () => {
    it('reduces the balance by the debit amount', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(500),
        'ACTIVE',
      );

      account.debit(createMoney(200));

      expect(account.balance.value).toBe(300);
    });

    it('allows debiting the entire balance', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(500),
        'ACTIVE',
      );

      account.debit(createMoney(500));

      expect(account.balance.value).toBe(0);
    });

    it('refuses to debit more than the available balance', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(100),
        'ACTIVE',
      );

      expect(() => account.debit(createMoney(200))).toThrow(
        InsufficientFundsError,
      );
    });

    it('does not change the balance when debit is refused', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(100),
        'ACTIVE',
      );

      try {
        account.debit(createMoney(200));
      } catch {
        // expected
      }

      expect(account.balance.value).toBe(100);
    });
  });

  describe('credit', () => {
    it('increases the balance by the credit amount', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(100),
        'ACTIVE',
      );

      account.credit(createMoney(300));

      expect(account.balance.value).toBe(400);
    });

    it('credits a zero-balance account', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(0),
        'ACTIVE',
      );

      account.credit(createMoney(500));

      expect(account.balance.value).toBe(500);
    });
  });

  describe('uses value objects for identity and balance', () => {
    it('exposes id as AccountId, not a raw string', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(100),
        'ACTIVE',
      );

      const id = account.id;
      expect(id).toBeInstanceOf(AccountId);
      expect(id.value).toBe(VALID_UUID);
    });

    it('exposes balance as Money, not a raw number', () => {
      const account = new Account(
        createAccountId(),
        'Alice',
        createMoney(100),
        'ACTIVE',
      );

      const balance = account.balance;
      expect(balance).toBeInstanceOf(Money);
      expect(balance.value).toBe(100);
    });
  });
});
