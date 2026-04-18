import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateAccountUseCase } from '../../use-cases/create-account/create-account.use-case';
import { GetAccountUseCase } from '../../use-cases/get-account/get-account.use-case';
import { ListAccountsUseCase } from '../../use-cases/list-accounts/list-accounts.use-case';
import {
  presentAccount,
  presentAccountList,
} from '../presenters/account.presenter';
import { CreateAccountDto } from './dto/create-account.dto';

@Controller('accounts')
export class AccountController {
  constructor(
    private readonly createAccount: CreateAccountUseCase,
    private readonly getAccount: GetAccountUseCase,
    private readonly listAccounts: ListAccountsUseCase,
  ) {}

  @Post()
  async create(@Body() body: CreateAccountDto) {
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
