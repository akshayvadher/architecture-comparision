import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { TransfersService } from './transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.transfersService.getTransferById(id);
  }

  @Post()
  async create(
    @Body() body: {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
    },
  ) {
    return this.transfersService.executeTransfer(
      body.fromAccountId,
      body.toAccountId,
      body.amount,
    );
  }
}
