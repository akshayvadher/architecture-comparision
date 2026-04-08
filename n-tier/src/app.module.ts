import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AccountsModule } from './accounts/accounts.module';
import { TransfersModule } from './transfers/transfers.module';

@Module({
  imports: [DatabaseModule, AccountsModule, TransfersModule],
})
export class AppModule {}
