import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TransferService } from '../../application/transfer.service';
import { InitiateTransferDto } from './dto/initiate-transfer.dto';

@Controller('transfers')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @Post()
  async create(@Body() body: InitiateTransferDto) {
    return this.transferService.initiateTransfer(
      body.fromAccountId,
      body.toAccountId,
      body.amount,
    );
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.transferService.getTransferById(id);
  }
}
