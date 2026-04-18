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
import { InitiateTransferCommand } from '../../commands/initiate-transfer.command';
import { GetTransferQuery } from '../../queries/get-transfer.query';
import { InitiateTransferDto } from './dto/initiate-transfer.dto';

@Controller('transfers')
export class TransferController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: InitiateTransferDto) {
    return this.commandBus.execute(
      new InitiateTransferCommand(
        body.fromAccountId,
        body.toAccountId,
        body.amount,
      ),
    );
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.queryBus.execute(new GetTransferQuery(id));
  }
}
