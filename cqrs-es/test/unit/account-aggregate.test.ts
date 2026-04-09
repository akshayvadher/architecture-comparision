import { describe, it, expect } from 'vitest';
import { Account } from '../../src/domain/aggregates/account';
import {
  AccountCreatedEvent,
  AccountCreditedEvent,
  AccountDebitedEvent,
  AccountEvent,
} from '../../src/domain/events/account-events';
import {
  InsufficientFundsError,
  InvalidBalanceError,
  InvalidOwnerError,
} from '../../src/domain/errors/domain-errors';

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TRANSFER_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('Account aggregate', () => {
  describe('creating an account', () => {
    it('produces an AccountCreated event with correct account id, owner, balance, and ACTIVE status', () => {
      const [, event] = Account.create(ACCOUNT_ID, 'Alice', 1000);

      expect(event).toEqual({
        type: 'AccountCreated',
        data: {
          accountId: ACCOUNT_ID,
          owner: 'Alice',
          balance: 1000,
          status: 'ACTIVE',
        },
      });
    });

    it('returns an account with correct state after creation', () => {
      const [account] = Account.create(ACCOUNT_ID, 'Alice', 1000);

      expect(account.id).toBe(ACCOUNT_ID);
      expect(account.owner).toBe('Alice');
      expect(account.balance).toBe(1000);
      expect(account.status).toBe('ACTIVE');
    });

    it('allows creation with zero balance', () => {
      const [account, event] = Account.create(ACCOUNT_ID, 'Bob', 0);

      expect(account.balance).toBe(0);
      expect(event.data.balance).toBe(0);
    });

    it('rejects a negative initial balance before producing any event', () => {
      expect(() => Account.create(ACCOUNT_ID, 'Alice', -100)).toThrow(
        InvalidBalanceError,
      );
    });

    it('rejects an empty owner name before producing any event', () => {
      expect(() => Account.create(ACCOUNT_ID, '', 1000)).toThrow(
        InvalidOwnerError,
      );
    });

    it('rejects a whitespace-only owner name', () => {
      expect(() => Account.create(ACCOUNT_ID, '   ', 1000)).toThrow(
        InvalidOwnerError,
      );
    });
  });

  describe('reconstituting from events', () => {
    it('restores correct state from a single AccountCreated event', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          data: {
            accountId: ACCOUNT_ID,
            owner: 'Alice',
            balance: 1000,
            status: 'ACTIVE',
          },
        },
      ];

      const account = Account.reconstitute(events);

      expect(account.id).toBe(ACCOUNT_ID);
      expect(account.owner).toBe('Alice');
      expect(account.balance).toBe(1000);
      expect(account.status).toBe('ACTIVE');
      expect(account.version).toBe(1);
    });

    it('replays created, debited, and credited events to produce the correct balance', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          data: {
            accountId: ACCOUNT_ID,
            owner: 'Alice',
            balance: 1000,
            status: 'ACTIVE',
          },
        },
        {
          type: 'AccountDebited',
          data: { accountId: ACCOUNT_ID, amount: 200, transferId: TRANSFER_ID },
        },
        {
          type: 'AccountCredited',
          data: { accountId: ACCOUNT_ID, amount: 50, transferId: TRANSFER_ID },
        },
      ];

      const account = Account.reconstitute(events);

      expect(account.balance).toBe(850);
      expect(account.version).toBe(3);
    });

    it('tracks version number matching the count of applied events', () => {
      const events: AccountEvent[] = [
        {
          type: 'AccountCreated',
          data: {
            accountId: ACCOUNT_ID,
            owner: 'Alice',
            balance: 500,
            status: 'ACTIVE',
          },
        },
        {
          type: 'AccountDebited',
          data: { accountId: ACCOUNT_ID, amount: 100, transferId: TRANSFER_ID },
        },
      ];

      const account = Account.reconstitute(events);
      expect(account.version).toBe(2);
    });
  });

  describe('debit behavior', () => {
    it('produces an AccountDebited event with the correct amount and transfer id', () => {
      const [account] = Account.create(ACCOUNT_ID, 'Alice', 500);

      const event = account.debit(200, TRANSFER_ID);

      expect(event).toEqual({
        type: 'AccountDebited',
        data: {
          accountId: ACCOUNT_ID,
          amount: 200,
          transferId: TRANSFER_ID,
        },
      });
    });

    it('throws InsufficientFundsError when debit exceeds balance', () => {
      const [account] = Account.create(ACCOUNT_ID, 'Alice', 100);

      expect(() => account.debit(200, TRANSFER_ID)).toThrow(
        InsufficientFundsError,
      );
    });

    it('allows debiting the entire balance', () => {
      const [account] = Account.create(ACCOUNT_ID, 'Alice', 500);

      const event = account.debit(500, TRANSFER_ID);

      expect(event.data.amount).toBe(500);
    });
  });

  describe('credit behavior', () => {
    it('produces an AccountCredited event with the correct amount and transfer id', () => {
      const [account] = Account.create(ACCOUNT_ID, 'Alice', 100);

      const event = account.credit(300, TRANSFER_ID);

      expect(event).toEqual({
        type: 'AccountCredited',
        data: {
          accountId: ACCOUNT_ID,
          amount: 300,
          transferId: TRANSFER_ID,
        },
      });
    });
  });
});
