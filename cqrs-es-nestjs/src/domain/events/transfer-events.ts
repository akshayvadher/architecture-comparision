export class TransferInitiated {
  constructor(
    public readonly transferId: string,
    public readonly fromAccountId: string,
    public readonly toAccountId: string,
    public readonly amount: number,
    public readonly timestamp: string,
  ) {}
}

export class TransferCompleted {
  constructor(
    public readonly transferId: string,
    public readonly timestamp: string,
  ) {}
}

export class TransferFailed {
  constructor(
    public readonly transferId: string,
    public readonly reason: string,
    public readonly timestamp: string,
  ) {}
}
