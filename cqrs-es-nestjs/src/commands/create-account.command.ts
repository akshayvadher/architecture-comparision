export class CreateAccountCommand {
  constructor(
    public readonly owner: string,
    public readonly balance: number,
  ) {}
}
