import {
  InsufficientFundsError,
  InvalidBalanceError,
  InvalidOwnerError,
} from '../errors/domain-errors';
import type {
  AccountCreatedEvent,
  AccountCreditedEvent,
  AccountDebitedEvent,
  AccountEvent,
} from '../events/account-events';

export interface AccountSnapshot {
  id: string;
  owner: string;
  balance: number;
  status: string;
  version: number;
}

export class Account {
  readonly id: string;
  readonly owner: string;
  readonly balance: number;
  readonly status: string;
  readonly version: number;

  private constructor(
    id: string,
    owner: string,
    balance: number,
    status: string,
    version: number,
  ) {
    this.id = id;
    this.owner = owner;
    this.balance = balance;
    this.status = status;
    this.version = version;
  }

  static create(
    id: string,
    owner: string,
    balance: number,
  ): [Account, AccountCreatedEvent] {
    if (!owner || owner.trim() === '') {
      throw new InvalidOwnerError();
    }
    if (balance < 0) {
      throw new InvalidBalanceError();
    }

    const event: AccountCreatedEvent = {
      type: 'AccountCreated',
      data: { accountId: id, owner, balance, status: 'ACTIVE' },
    };

    const account = new Account(id, owner, balance, 'ACTIVE', 0);
    return [account, event];
  }

  debit(amount: number, transferId: string): AccountDebitedEvent {
    if (this.balance < amount) {
      throw new InsufficientFundsError(this.id, this.balance, amount);
    }

    return {
      type: 'AccountDebited',
      data: { accountId: this.id, amount, transferId },
    };
  }

  credit(amount: number, transferId: string): AccountCreditedEvent {
    return {
      type: 'AccountCredited',
      data: { accountId: this.id, amount, transferId },
    };
  }

  static reconstitute(events: AccountEvent[]): Account {
    let account = new Account('', '', 0, '', 0);
    for (const event of events) {
      account = account.apply(event);
    }
    return account;
  }

  toSnapshot(): AccountSnapshot {
    return {
      id: this.id,
      owner: this.owner,
      balance: this.balance,
      status: this.status,
      version: this.version,
    };
  }

  static fromSnapshot(state: AccountSnapshot): Account {
    return new Account(
      state.id,
      state.owner,
      state.balance,
      state.status,
      state.version,
    );
  }

  static replayFromSnapshot(
    snapshot: AccountSnapshot,
    events: AccountEvent[],
  ): Account {
    let account = Account.fromSnapshot(snapshot);
    for (const event of events) {
      account = account.apply(event);
    }
    return account;
  }

  private apply(event: AccountEvent): Account {
    switch (event.type) {
      case 'AccountCreated':
        return new Account(
          event.data.accountId,
          event.data.owner,
          event.data.balance,
          event.data.status,
          this.version + 1,
        );
      case 'AccountDebited':
        return new Account(
          this.id,
          this.owner,
          this.balance - event.data.amount,
          this.status,
          this.version + 1,
        );
      case 'AccountCredited':
        return new Account(
          this.id,
          this.owner,
          this.balance + event.data.amount,
          this.status,
          this.version + 1,
        );
    }
  }
}
