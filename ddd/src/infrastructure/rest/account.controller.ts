import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { AccountService } from '../../application/account.service';

@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  async create(@Body() body: { owner: string; balance: number }) {
    return this.accountService.createAccount(body.owner, body.balance);
  }

  @Get()
  async list() {
    return this.accountService.listAccounts();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.accountService.getAccountById(id);
  }
}
