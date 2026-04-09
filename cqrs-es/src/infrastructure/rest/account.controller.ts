import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import type { CreateAccountHandler } from '../../commands/create-account.handler';
import type { GetAccountHandler } from '../../queries/get-account.handler';
import type { GetAccountEventsHandler } from '../../queries/get-account-events.handler';
import type { ListAccountsHandler } from '../../queries/list-accounts.handler';

@Controller('accounts')
export class AccountController {
  constructor(
    private readonly createAccountHandler: CreateAccountHandler,
    private readonly getAccountHandler: GetAccountHandler,
    private readonly getAccountEventsHandler: GetAccountEventsHandler,
    private readonly listAccountsHandler: ListAccountsHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: { owner: string; balance: number }) {
    return this.createAccountHandler.execute(body.owner, body.balance);
  }

  @Get()
  async list() {
    return this.listAccountsHandler.execute();
  }

  @Get(':id/events')
  async getEvents(@Param('id') id: string) {
    return this.getAccountEventsHandler.execute(id);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.getAccountHandler.execute(id);
  }
}
