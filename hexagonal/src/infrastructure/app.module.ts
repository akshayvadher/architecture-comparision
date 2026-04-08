import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AccountService } from '../application/account.service';
import { TransferService } from '../application/transfer.service';
import { AccountController } from '../adapters/driving/rest/account.controller';
import { TransferController } from '../adapters/driving/rest/transfer.controller';
import { DomainErrorFilter } from '../adapters/driving/rest/error-filter';
import { DrizzleAccountRepository } from '../adapters/driven/persistence/drizzle/account-repository.adapter';
import { DrizzleTransferRepository } from '../adapters/driven/persistence/drizzle/transfer-repository.adapter';
import { DrizzleUnitOfWork } from '../adapters/driven/persistence/drizzle/unit-of-work.adapter';
import { drizzleProvider } from '../adapters/driven/persistence/drizzle/drizzle.provider';
import { ACCOUNT_REPOSITORY } from '../domain/ports/account-repository.port';
import { TRANSFER_REPOSITORY } from '../domain/ports/transfer-repository.port';
import { UNIT_OF_WORK } from '../domain/ports/unit-of-work.port';

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
