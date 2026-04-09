export class AccountCreated {
  constructor(
    public readonly accountId: string,
    public readonly owner: string,
    public readonly balance: number,
    public readonly status: string,
  ) {}
}

export class AccountDebited {
  constructor(
    public readonly accountId: string,
    public readonly amount: number,
    public readonly transferId: string,
  ) {}
}

export class AccountCredited {
  constructor(
    public readonly accountId: string,
    public readonly amount: number,
    public readonly transferId: string,
  ) {}
}
