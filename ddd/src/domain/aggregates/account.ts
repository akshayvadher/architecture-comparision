import { InsufficientFundsError } from '../errors/domain-errors';
import { InvalidOwnerError } from '../errors/domain-errors';
import { AccountId } from '../value-objects/account-id';
import { Money } from '../value-objects/money';

export class Account {
  private _balance: Money;

  constructor(
    private readonly _id: AccountId,
    private readonly _owner: string,
    balance: Money,
    private readonly _status: string,
  ) {
    if (!_owner || _owner.trim() === '') {
      throw new InvalidOwnerError();
    }
    this._balance = balance;
  }

  get id(): AccountId {
    return this._id;
  }

  get owner(): string {
    return this._owner;
  }

  get balance(): Money {
    return this._balance;
  }

  get status(): string {
    return this._status;
  }

  debit(amount: Money): void {
    if (!this._balance.isGreaterThanOrEqual(amount)) {
      throw new InsufficientFundsError(
        this._id.value,
        this._balance.value,
        amount.value,
      );
    }
    this._balance = this._balance.subtract(amount);
  }

  credit(amount: Money): void {
    this._balance = this._balance.add(amount);
  }
}
