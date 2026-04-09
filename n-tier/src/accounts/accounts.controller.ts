import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { AccountsService } from './accounts.service';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  async create(@Body() body: { owner: string; balance: number }) {
    return this.accountsService.createAccount(body.owner, body.balance);
  }

  @Get()
  async findAll() {
    return this.accountsService.getAllAccounts();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.accountsService.getAccountById(id);
  }
}
