import { describe, expect, it } from 'vitest';
import { Transfer } from '../../../src/domain/aggregates/transfer';
import { AccountId } from '../../../src/domain/value-objects/account-id';
import { Money } from '../../../src/domain/value-objects/money';
import { TransferId } from '../../../src/domain/value-objects/transfer-id';

describe('Transfer aggregate — domain event production', () => {
  const transferId = TransferId.create('11111111-1111-1111-1111-111111111111');
  const fromAccountId = AccountId.create(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  );
  const toAccountId = AccountId.create('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  const amount = Money.create(250);
  const timestamp = new Date('2026-01-15T10:00:00Z');

  describe('Transfer.completed', () => {
    it('produces a TransferCompleted event with transfer id, account ids, amount, and timestamp', () => {
      const transfer = Transfer.completed(
        transferId,
        fromAccountId,
        toAccountId,
        amount,
        timestamp,
      );

      const events = transfer.domainEvents;
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.type).toBe('TransferCompleted');
      expect(event.data).toEqual({
        transferId: '11111111-1111-1111-1111-111111111111',
        fromAccountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        toAccountId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        amount: 250,
      });
      expect(event.timestamp).toEqual(timestamp);
    });

    it('sets status to COMPLETED', () => {
      const transfer = Transfer.completed(
        transferId,
        fromAccountId,
        toAccountId,
        amount,
        timestamp,
      );

      expect(transfer.status).toBe('COMPLETED');
    });

    it('exposes all transfer properties through getters', () => {
      const transfer = Transfer.completed(
        transferId,
        fromAccountId,
        toAccountId,
        amount,
        timestamp,
      );

      expect(transfer.id.value).toBe('11111111-1111-1111-1111-111111111111');
      expect(transfer.fromAccountId.value).toBe(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      );
      expect(transfer.toAccountId.value).toBe(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      );
      expect(transfer.amount.value).toBe(250);
      expect(transfer.timestamp).toEqual(timestamp);
    });
  });

  describe('Transfer.failed', () => {
    it('produces a TransferFailed event with transfer id, account ids, amount, reason, and timestamp', () => {
      const reason =
        'Insufficient funds in account aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const transfer = Transfer.failed(
        transferId,
        fromAccountId,
        toAccountId,
        amount,
        timestamp,
        reason,
      );

      const events = transfer.domainEvents;
      expect(events).toHaveLength(1);

      const event = events[0];
      expect(event.type).toBe('TransferFailed');
      expect(event.data).toEqual({
        transferId: '11111111-1111-1111-1111-111111111111',
        fromAccountId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        toAccountId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        amount: 250,
        reason,
      });
      expect(event.timestamp).toEqual(timestamp);
    });

    it('sets status to FAILED', () => {
      const transfer = Transfer.failed(
        transferId,
        fromAccountId,
        toAccountId,
        amount,
        timestamp,
        'some reason',
      );

      expect(transfer.status).toBe('FAILED');
    });
  });

  describe('domainEvents getter', () => {
    it('returns a copy — modifying the returned array does not affect the aggregate', () => {
      const transfer = Transfer.completed(
        transferId,
        fromAccountId,
        toAccountId,
        amount,
        timestamp,
      );

      const events = transfer.domainEvents;
      events.pop();

      expect(transfer.domainEvents).toHaveLength(1);
    });
  });
});
