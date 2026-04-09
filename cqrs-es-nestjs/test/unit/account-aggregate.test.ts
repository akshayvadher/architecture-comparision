import { describe, it, expect } from 'vitest';
import { Account } from '../../src/domain/aggregates/account';
import {
  AccountCreated,
  AccountDebited,
  AccountCredited,
} from '../../src/domain/events/account-events';
import {
  InsufficientFundsError,
  InvalidBalanceError,
  InvalidOwnerError,
} from '../../src/domain/errors/domain-errors';

const ACCOUNT_ID = '550e8400-e29b-41d4-a716-446655440000';
const TRANSFER_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('Account aggregate (AggregateRoot)', () => {
  describe('creating an account', () => {
    it('produces an AccountCreated uncommitted event with accountId, owner, balance, and ACTIVE status', () => {
      const account = Account.create(ACCOUNT_ID, 'Alice', 1000);

      const uncommitted = account.getUncommittedEvents();

      expect(uncommitted).toHaveLength(1);
      const event = uncommitted[0] as AccountCreated;
      expect(event).toBeInstanceOf(AccountCreated);
      expect(event.accountId).toBe(ACCOUNT_ID);
      expect(event.owner).toBe('Alice');
      expect(event.balance).toBe(1000);
      expect(event.status).toBe('ACTIVE');
    });

    it('sets aggregate state from the applied event', () => {
      const account = Account.create(ACCOUNT_ID, 'Alice', 1000);

      expect(account.id).toBe(ACCOUNT_ID);
      expect(account.owner).toBe('Alice');
      expect(account.balance).toBe(1000);
      expect(account.status).toBe('ACTIVE');
    });

    it('allows creation with zero balance', () => {
      const account = Account.create(ACCOUNT_ID, 'Bob', 0);

      expect(account.balance).toBe(0);

      const event = account.getUncommittedEvents()[0] as AccountCreated;
      expect(event.balance).toBe(0);
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

  describe('reconstituting from event history (loadFromHistory)', () => {
    it('restores correct state from a single AccountCreated event', () => {
      const account = new Account();
      account.loadFromHistory([
        Object.assign(new AccountCreated('', '', 0, ''), {
          accountId: ACCOUNT_ID,
          owner: 'Alice',
          balance: 1000,
          status: 'ACTIVE',
        }),
      ]);

      expect(account.id).toBe(ACCOUNT_ID);
      expect(account.owner).toBe('Alice');
      expect(account.balance).toBe(1000);
      expect(account.status).toBe('ACTIVE');
      expect(account.version).toBe(1);
    });

    it('replays created, debited, and credited events to produce the correct balance', () => {
      const account = new Account();
      account.loadFromHistory([
        Object.assign(new AccountCreated('', '', 0, ''), {
          accountId: ACCOUNT_ID,
          owner: 'Alice',
          balance: 1000,
          status: 'ACTIVE',
        }),
        Object.assign(new AccountDebited('', 0, ''), {
          accountId: ACCOUNT_ID,
          amount: 200,
          transferId: TRANSFER_ID,
        }),
        Object.assign(new AccountCredited('', 0, ''), {
          accountId: ACCOUNT_ID,
          amount: 50,
          transferId: TRANSFER_ID,
        }),
      ]);

      expect(account.balance).toBe(850);
      expect(account.version).toBe(3);
    });

    it('does not produce uncommitted events when replaying history', () => {
      const account = new Account();
      account.loadFromHistory([
        Object.assign(new AccountCreated('', '', 0, ''), {
          accountId: ACCOUNT_ID,
          owner: 'Alice',
          balance: 500,
          status: 'ACTIVE',
        }),
      ]);

      expect(account.getUncommittedEvents()).toHaveLength(0);
    });

    it('tracks version number matching the count of applied events', () => {
      const account = new Account();
      account.loadFromHistory([
        Object.assign(new AccountCreated('', '', 0, ''), {
          accountId: ACCOUNT_ID,
          owner: 'Alice',
          balance: 500,
          status: 'ACTIVE',
        }),
        Object.assign(new AccountDebited('', 0, ''), {
          accountId: ACCOUNT_ID,
          amount: 100,
          transferId: TRANSFER_ID,
        }),
      ]);

      expect(account.version).toBe(2);
    });
  });

  describe('event production (not direct state mutation)', () => {
    it('queues events via getUncommittedEvents instead of mutating state directly', () => {
      const account = Account.create(ACCOUNT_ID, 'Alice', 1000);

      const events = account.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(AccountCreated);

      // State is also updated (via onAccountCreated), but the event is the source of truth
      expect(account.id).toBe(ACCOUNT_ID);
    });
  });

  describe('debit behavior', () => {
    it('produces an AccountDebited uncommitted event', () => {
      const account = Account.create(ACCOUNT_ID, 'Alice', 500);
      account.commit(); // clear the AccountCreated event

      account.debit(200, TRANSFER_ID);

      const uncommitted = account.getUncommittedEvents();
      expect(uncommitted).toHaveLength(1);
      const event = uncommitted[0] as AccountDebited;
      expect(event).toBeInstanceOf(AccountDebited);
      expect(event.accountId).toBe(ACCOUNT_ID);
      expect(event.amount).toBe(200);
      expect(event.transferId).toBe(TRANSFER_ID);
    });

    it('throws InsufficientFundsError when debit exceeds balance', () => {
      const account = Account.create(ACCOUNT_ID, 'Alice', 100);

      expect(() => account.debit(200, TRANSFER_ID)).toThrow(
        InsufficientFundsError,
      );
    });

    it('allows debiting the entire balance', () => {
      const account = Account.create(ACCOUNT_ID, 'Alice', 500);
      account.commit();

      account.debit(500, TRANSFER_ID);

      const event = account.getUncommittedEvents()[0] as AccountDebited;
      expect(event.amount).toBe(500);
    });
  });

  describe('credit behavior', () => {
    it('produces an AccountCredited uncommitted event', () => {
      const account = Account.create(ACCOUNT_ID, 'Alice', 100);
      account.commit();

      account.credit(300, TRANSFER_ID);

      const uncommitted = account.getUncommittedEvents();
      expect(uncommitted).toHaveLength(1);
      const event = uncommitted[0] as AccountCredited;
      expect(event).toBeInstanceOf(AccountCredited);
      expect(event.accountId).toBe(ACCOUNT_ID);
      expect(event.amount).toBe(300);
      expect(event.transferId).toBe(TRANSFER_ID);
    });
  });

  describe('EventStore has no update or delete methods', () => {
    it('EventStore class exposes only append, appendMultiple, loadEvents, and deserialize methods', async () => {
      // Structural verification: import EventStore and check it has no update/delete
      const { EventStore } = await import(
        '../../src/infrastructure/event-store/event-store'
      );

      const proto = EventStore.prototype;
      const methodNames = Object.getOwnPropertyNames(proto).filter(
        (name) => name !== 'constructor',
      );

      expect(methodNames).not.toContain('update');
      expect(methodNames).not.toContain('delete');
      expect(methodNames).not.toContain('remove');

      // Positive check: the methods we expect exist
      expect(methodNames).toContain('append');
      expect(methodNames).toContain('loadEvents');
      expect(methodNames).toContain('deserializeEvent');
      expect(methodNames).toContain('deserializeEvents');
    });
  });
});
