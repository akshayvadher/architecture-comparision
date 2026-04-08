import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TransferService } from '../../application/transfer.service';

@Controller('transfers')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @Post()
  async create(
    @Body() body: { fromAccountId: string; toAccountId: string; amount: number },
  ) {
    return this.transferService.executeTransfer(
      body.fromAccountId,
      body.toAccountId,
      body.amount,
    );
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.transferService.getTransferById(id);
  }
}
