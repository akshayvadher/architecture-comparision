import { InvalidIdError } from '../errors/domain-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AccountId {
  private constructor(private readonly id: string) {}

  static create(id: string): AccountId {
    if (!UUID_REGEX.test(id)) {
      throw new InvalidIdError(id);
    }
    return new AccountId(id);
  }

  get value(): string {
    return this.id;
  }

  equals(other: AccountId): boolean {
    return this.id === other.id;
  }
}
