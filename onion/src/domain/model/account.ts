import { InvalidBalanceError, InvalidOwnerError } from './errors';

export interface Account {
  id: string;
  owner: string;
  balance: number;
  status: string;
}

function validateOwner(owner: string): void {
  if (!owner || owner.trim() === '') {
    throw new InvalidOwnerError();
  }
}

function validateInitialBalance(balance: number): void {
  if (balance < 0) {
    throw new InvalidBalanceError();
  }
}

export function createAccount(
  id: string,
  owner: string,
  balance: number,
): Account {
  validateOwner(owner);
  validateInitialBalance(balance);

  return {
    id,
    owner,
    balance,
    status: 'ACTIVE',
  };
}
