import { Inject, Injectable } from '@nestjs/common';
import { ACCOUNT_GATEWAY, AccountGateway } from '../gateways/account.gateway';
import { ListAccountsOutput } from './list-accounts.output';

@Injectable()
export class ListAccountsUseCase {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accountGateway: AccountGateway,
  ) {}

  async execute(): Promise<ListAccountsOutput> {
    const accounts = await this.accountGateway.findAll();
    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        owner: account.owner,
        balance: account.balance,
        status: account.status,
      })),
    };
  }
}
