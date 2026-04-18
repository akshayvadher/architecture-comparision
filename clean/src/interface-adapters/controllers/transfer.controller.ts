import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { GetTransferUseCase } from '../../use-cases/get-transfer/get-transfer.use-case';
import { InitiateTransferUseCase } from '../../use-cases/initiate-transfer/initiate-transfer.use-case';
import { presentTransfer } from '../presenters/transfer.presenter';
import { InitiateTransferDto } from './dto/initiate-transfer.dto';

@Controller('transfers')
export class TransferController {
  constructor(
    private readonly initiateTransfer: InitiateTransferUseCase,
    private readonly getTransfer: GetTransferUseCase,
  ) {}

  @Post()
  async create(@Body() body: InitiateTransferDto) {
    const output = await this.initiateTransfer.execute({
      fromAccountId: body.fromAccountId,
      toAccountId: body.toAccountId,
      amount: body.amount,
    });
    return presentTransfer(output);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const output = await this.getTransfer.execute({ transferId: id });
    return presentTransfer(output);
  }
}
