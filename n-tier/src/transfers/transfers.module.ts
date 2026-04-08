import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { TransfersRepository } from './transfers.repository';

@Module({
  imports: [AccountsModule],
  controllers: [TransfersController],
  providers: [TransfersService, TransfersRepository],
  exports: [TransfersService, TransfersRepository],
})
export class TransfersModule {}
