export class InvalidOwnerError extends Error {
  constructor() {
    super('Owner name is required');
    this.name = 'InvalidOwnerError';
  }
}

export class InvalidBalanceError extends Error {
  constructor() {
    super('Initial balance cannot be negative');
    this.name = 'InvalidBalanceError';
  }
}

export class InsufficientFundsError extends Error {
  constructor(accountId: string, available: number, requested: number) {
    super(
      `Insufficient funds in account ${accountId}: available ${available}, requested ${requested}`,
    );
    this.name = 'InsufficientFundsError';
  }
}

export class InvalidAmountError extends Error {
  constructor() {
    super('Transfer amount must be greater than zero');
    this.name = 'InvalidAmountError';
  }
}

export class AccountNotFoundError extends Error {
  constructor(id: string) {
    super(`Account with id ${id} not found`);
    this.name = 'AccountNotFoundError';
  }
}

export class InvalidIdError extends Error {
  constructor(id: string) {
    super(`Invalid id format: ${id}`);
    this.name = 'InvalidIdError';
  }
}

export class TransferNotFoundError extends Error {
  constructor(id: string) {
    super(`Transfer with id ${id} not found`);
    this.name = 'TransferNotFoundError';
  }
}

export class ConcurrencyError extends Error {
  constructor(aggregateId: string) {
    super(`Concurrency conflict for aggregate ${aggregateId}`);
    this.name = 'ConcurrencyError';
  }
}
