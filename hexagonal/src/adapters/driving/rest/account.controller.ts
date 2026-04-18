import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AccountService } from '../../../application/account.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Controller('accounts')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post()
  async create(@Body() body: CreateAccountDto) {
    return this.accountService.createAccount(body.owner, body.balance);
  }

  @Get()
  async findAll() {
    return this.accountService.getAllAccounts();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.accountService.getAccountById(id);
  }
}
