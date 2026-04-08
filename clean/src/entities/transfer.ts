export class Transfer {
  readonly id: string;
  readonly fromAccountId: string;
  readonly toAccountId: string;
  readonly amount: number;
  readonly timestamp: Date;
  readonly status: string;

  constructor(
    id: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    timestamp: Date,
    status: string,
  ) {
    this.id = id;
    this.fromAccountId = fromAccountId;
    this.toAccountId = toAccountId;
    this.amount = amount;
    this.timestamp = timestamp;
    this.status = status;
  }
}
