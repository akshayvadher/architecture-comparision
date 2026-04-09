import type { DomainEvent } from '../events/domain-event';
import type { TransferCompleted } from '../events/transfer-completed';
import type { TransferFailed } from '../events/transfer-failed';
import type { AccountId } from '../value-objects/account-id';
import type { Money } from '../value-objects/money';
import type { TransferId } from '../value-objects/transfer-id';

export type TransferStatus = 'COMPLETED' | 'FAILED';

export class Transfer {
  private readonly _events: DomainEvent[] = [];

  private constructor(
    private readonly _id: TransferId,
    private readonly _fromAccountId: AccountId,
    private readonly _toAccountId: AccountId,
    private readonly _amount: Money,
    private readonly _timestamp: Date,
    private readonly _status: TransferStatus,
  ) {}

  static completed(
    id: TransferId,
    fromAccountId: AccountId,
    toAccountId: AccountId,
    amount: Money,
    timestamp: Date,
  ): Transfer {
    const transfer = new Transfer(
      id,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
      'COMPLETED',
    );
    const event: TransferCompleted = {
      type: 'TransferCompleted',
      data: {
        transferId: id.value,
        fromAccountId: fromAccountId.value,
        toAccountId: toAccountId.value,
        amount: amount.value,
      },
      timestamp,
    };
    transfer._events.push(event);
    return transfer;
  }

  static failed(
    id: TransferId,
    fromAccountId: AccountId,
    toAccountId: AccountId,
    amount: Money,
    timestamp: Date,
    reason: string,
  ): Transfer {
    const transfer = new Transfer(
      id,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
      'FAILED',
    );
    const event: TransferFailed = {
      type: 'TransferFailed',
      data: {
        transferId: id.value,
        fromAccountId: fromAccountId.value,
        toAccountId: toAccountId.value,
        amount: amount.value,
        reason,
      },
      timestamp,
    };
    transfer._events.push(event);
    return transfer;
  }

  static reconstitute(
    id: TransferId,
    fromAccountId: AccountId,
    toAccountId: AccountId,
    amount: Money,
    timestamp: Date,
    status: TransferStatus,
    events: DomainEvent[],
  ): Transfer {
    const transfer = new Transfer(
      id,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
      status,
    );
    transfer._events.push(...events);
    return transfer;
  }

  get id(): TransferId {
    return this._id;
  }

  get fromAccountId(): AccountId {
    return this._fromAccountId;
  }

  get toAccountId(): AccountId {
    return this._toAccountId;
  }

  get amount(): Money {
    return this._amount;
  }

  get timestamp(): Date {
    return this._timestamp;
  }

  get status(): TransferStatus {
    return this._status;
  }

  get domainEvents(): ReadonlyArray<DomainEvent> {
    return [...this._events];
  }
}
