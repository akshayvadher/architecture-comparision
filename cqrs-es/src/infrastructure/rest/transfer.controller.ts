import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { InitiateTransferHandler } from '../../commands/initiate-transfer.handler';
import { GetTransferHandler } from '../../queries/get-transfer.handler';
import { InitiateTransferDto } from './dto/initiate-transfer.dto';

@Controller('transfers')
export class TransferController {
  constructor(
    private readonly initiateTransferHandler: InitiateTransferHandler,
    private readonly getTransferHandler: GetTransferHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: InitiateTransferDto) {
    return this.initiateTransferHandler.execute(
      body.fromAccountId,
      body.toAccountId,
      body.amount,
    );
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.getTransferHandler.execute(id);
  }
}
