import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { GetTransferUseCase } from '../../use-cases/get-transfer/get-transfer.use-case';
import type { InitiateTransferUseCase } from '../../use-cases/initiate-transfer/initiate-transfer.use-case';
import { presentTransfer } from '../presenters/transfer.presenter';

@Controller('transfers')
export class TransferController {
  constructor(
    private readonly initiateTransfer: InitiateTransferUseCase,
    private readonly getTransfer: GetTransferUseCase,
  ) {}

  @Post()
  async create(
    @Body() body: {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
    },
  ) {
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
