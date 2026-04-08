import { Inject, Injectable } from '@nestjs/common';
import { AccountNotFoundError, InvalidIdError } from '../../entities/errors';
import { ACCOUNT_GATEWAY, AccountGateway } from '../gateways/account.gateway';
import { GetAccountInput } from './get-account.input';
import { GetAccountOutput } from './get-account.output';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class GetAccountUseCase {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accountGateway: AccountGateway,
  ) {}

  async execute(input: GetAccountInput): Promise<GetAccountOutput> {
    if (!UUID_REGEX.test(input.accountId)) {
      throw new InvalidIdError(input.accountId);
    }

    const account = await this.accountGateway.findById(input.accountId);
    if (!account) {
      throw new AccountNotFoundError(input.accountId);
    }

    return {
      id: account.id,
      owner: account.owner,
      balance: account.balance,
      status: account.status,
    };
  }
}
