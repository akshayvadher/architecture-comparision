import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AccountService } from '../application/account.service';
import { TransferService } from '../application/transfer.service';
import { ACCOUNT_REPOSITORY } from '../domain/services/account-repository.interface';
import { TRANSFER_REPOSITORY } from '../domain/services/transfer-repository.interface';
import { UNIT_OF_WORK } from '../domain/services/unit-of-work.interface';
import { AccountController } from './rest/account.controller';
import { TransferController } from './rest/transfer.controller';
import { DomainErrorFilter } from './rest/error-filter';
import { DrizzleAccountRepository } from './persistence/drizzle/account-repository';
import { DrizzleTransferRepository } from './persistence/drizzle/transfer-repository';
import { DrizzleUnitOfWork } from './persistence/drizzle/unit-of-work';
import { drizzleProvider } from './persistence/drizzle/drizzle.provider';

@Module({
  controllers: [AccountController, TransferController],
  providers: [
    drizzleProvider,
    {
      provide: ACCOUNT_REPOSITORY,
      useClass: DrizzleAccountRepository,
    },
    {
      provide: TRANSFER_REPOSITORY,
      useClass: DrizzleTransferRepository,
    },
    {
      provide: UNIT_OF_WORK,
      useClass: DrizzleUnitOfWork,
    },
    {
      provide: APP_FILTER,
      useClass: DomainErrorFilter,
    },
    AccountService,
    TransferService,
  ],
})
export class AppModule {}
