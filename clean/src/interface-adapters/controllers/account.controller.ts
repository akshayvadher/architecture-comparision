import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { CreateAccountUseCase } from '../../use-cases/create-account/create-account.use-case';
import type { GetAccountUseCase } from '../../use-cases/get-account/get-account.use-case';
import type { ListAccountsUseCase } from '../../use-cases/list-accounts/list-accounts.use-case';
import {
  presentAccount,
  presentAccountList,
} from '../presenters/account.presenter';

@Controller('accounts')
export class AccountController {
  constructor(
    private readonly createAccount: CreateAccountUseCase,
    private readonly getAccount: GetAccountUseCase,
    private readonly listAccounts: ListAccountsUseCase,
  ) {}

  @Post()
  async create(@Body() body: { owner: string; balance: number }) {
    const output = await this.createAccount.execute({
      owner: body.owner,
      balance: body.balance,
    });
    return presentAccount(output);
  }

  @Get()
  async list() {
    const output = await this.listAccounts.execute();
    return presentAccountList(output);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const output = await this.getAccount.execute({ accountId: id });
    return presentAccount(output);
  }
}
