import { AggregateRoot } from '@nestjs/cqrs';
import {
  InsufficientFundsError,
  InvalidBalanceError,
  InvalidOwnerError,
} from '../errors/domain-errors';
import {
  AccountCreated,
  AccountCredited,
  AccountDebited,
} from '../events/account-events';

export interface AccountSnapshot {
  id: string;
  owner: string;
  balance: number;
  status: string;
  version: number;
}

export class Account extends AggregateRoot {
  private _id: string = '';
  private _owner: string = '';
  private _balance: number = 0;
  private _status: string = '';
  private _version: number = 0;

  get id() {
    return this._id;
  }
  get owner() {
    return this._owner;
  }
  get balance() {
    return this._balance;
  }
  get status() {
    return this._status;
  }
  get version() {
    return this._version;
  }

  static create(id: string, owner: string, balance: number): Account {
    if (!owner || owner.trim() === '') throw new InvalidOwnerError();
    if (balance < 0) throw new InvalidBalanceError();

    const account = new Account();
    account.apply(new AccountCreated(id, owner, balance, 'ACTIVE'));
    return account;
  }

  debit(amount: number, transferId: string): void {
    if (amount > this._balance) {
      throw new InsufficientFundsError(this._id, this._balance, amount);
    }
    this.apply(new AccountDebited(this._id, amount, transferId));
  }

  credit(amount: number, transferId: string): void {
    this.apply(new AccountCredited(this._id, amount, transferId));
  }

  onAccountCreated(event: AccountCreated): void {
    this._id = event.accountId;
    this._owner = event.owner;
    this._balance = event.balance;
    this._status = event.status;
    this._version++;
  }

  onAccountDebited(event: AccountDebited): void {
    this._balance -= event.amount;
    this._version++;
  }

  onAccountCredited(event: AccountCredited): void {
    this._balance += event.amount;
    this._version++;
  }

  toSnapshot(): AccountSnapshot {
    return {
      id: this._id,
      owner: this._owner,
      balance: this._balance,
      status: this._status,
      version: this._version,
    };
  }

  static fromSnapshot(state: AccountSnapshot): Account {
    const account = new Account();
    account._id = state.id;
    account._owner = state.owner;
    account._balance = state.balance;
    account._status = state.status;
    account._version = state.version;
    return account;
  }
}
