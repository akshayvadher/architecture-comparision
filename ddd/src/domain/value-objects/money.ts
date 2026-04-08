import { InvalidBalanceError } from '../errors/domain-errors';

export class Money {
  private constructor(private readonly amount: number) {}

  static create(amount: number): Money {
    if (amount < 0) {
      throw new InvalidBalanceError();
    }
    return new Money(amount);
  }

  get value(): number {
    return this.amount;
  }

  add(other: Money): Money {
    return new Money(this.amount + other.value);
  }

  subtract(other: Money): Money {
    if (this.amount < other.value) {
      throw new InvalidBalanceError();
    }
    return new Money(this.amount - other.value);
  }

  equals(other: Money): boolean {
    return this.amount === other.value;
  }

  isGreaterThanOrEqual(other: Money): boolean {
    return this.amount >= other.value;
  }
}
