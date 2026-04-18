import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateAccountCommand } from '../../commands/create-account.command';
import { GetAccountQuery } from '../../queries/get-account.query';
import { GetAccountEventsQuery } from '../../queries/get-account-events.query';
import { ListAccountsQuery } from '../../queries/list-accounts.query';

@Controller('accounts')
export class AccountController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: { owner: string; balance: number }) {
    return this.commandBus.execute(
      new CreateAccountCommand(body.owner, body.balance),
    );
  }

  @Get()
  async list() {
    return this.queryBus.execute(new ListAccountsQuery());
  }

  @Get(':id/events')
  async getEvents(@Param('id') id: string) {
    return this.queryBus.execute(new GetAccountEventsQuery(id));
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.queryBus.execute(new GetAccountQuery(id));
  }
}
