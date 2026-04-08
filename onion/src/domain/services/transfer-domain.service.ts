import { Account } from '../model/account';
import { Transfer, createCompletedTransfer } from '../model/transfer';
import { InsufficientFundsError } from '../model/errors';

export interface TransferResult {
  debitedSource: Account;
  creditedDestination: Account;
  transfer: Transfer;
}

export function executeTransfer(
  transferId: string,
  source: Account,
  destination: Account,
  amount: number,
): TransferResult {
  if (source.balance < amount) {
    throw new InsufficientFundsError(source.id, source.balance, amount);
  }

  const debitedSource: Account = {
    ...source,
    balance: source.balance - amount,
  };

  const creditedDestination: Account = {
    ...destination,
    balance: destination.balance + amount,
  };

  const transfer = createCompletedTransfer(
    transferId,
    source.id,
    destination.id,
    amount,
  );

  return { debitedSource, creditedDestination, transfer };
}
