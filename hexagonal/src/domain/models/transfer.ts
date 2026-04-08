export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  timestamp: Date;
  status: 'COMPLETED' | 'FAILED';
}

export function createCompletedTransfer(
  id: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
): Transfer {
  return {
    id,
    fromAccountId,
    toAccountId,
    amount,
    timestamp: new Date(),
    status: 'COMPLETED',
  };
}

export function createFailedTransfer(
  id: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
): Transfer {
  return {
    id,
    fromAccountId,
    toAccountId,
    amount,
    timestamp: new Date(),
    status: 'FAILED',
  };
}
