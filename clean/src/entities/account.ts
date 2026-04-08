import { InvalidOwnerError, InvalidBalanceError, InsufficientFundsError } from './errors';

export class Account {
  private _balance: number;

  readonly id: string;
  readonly owner: string;
  readonly status: string;

  constructor(id: string, owner: string, balance: number, status: string) {
    if (!owner || owner.trim() === '') {
      throw new InvalidOwnerError();
    }
    if (balance < 0) {
      throw new InvalidBalanceError();
    }
    this.id = id;
    this.owner = owner;
    this._balance = balance;
    this.status = status;
  }

  get balance(): number {
    return this._balance;
  }

  debit(amount: number): void {
    if (amount > this._balance) {
      throw new InsufficientFundsError(this.id, this._balance, amount);
    }
    this._balance -= amount;
  }

  credit(amount: number): void {
    this._balance += amount;
  }
}
