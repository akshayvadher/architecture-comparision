import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { DatabaseModule } from './database/database.module';
import { TransfersModule } from './transfers/transfers.module';

@Module({
  imports: [DatabaseModule, AccountsModule, TransfersModule],
})
export class AppModule {}
