export class InitiateTransferCommand {
  constructor(
    public readonly fromAccountId: string,
    public readonly toAccountId: string,
    public readonly amount: number,
  ) {}
}
