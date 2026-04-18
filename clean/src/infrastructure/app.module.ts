import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { AccountController } from '../interface-adapters/controllers/account.controller';
import { TransferController } from '../interface-adapters/controllers/transfer.controller';
import { DomainErrorFilter } from '../interface-adapters/error-filter';
import { CreateAccountUseCase } from '../use-cases/create-account/create-account.use-case';
import { ACCOUNT_GATEWAY } from '../use-cases/gateways/account.gateway';
import { TRANSFER_GATEWAY } from '../use-cases/gateways/transfer.gateway';
import { UNIT_OF_WORK } from '../use-cases/gateways/unit-of-work.gateway';
import { GetAccountUseCase } from '../use-cases/get-account/get-account.use-case';
import { GetTransferUseCase } from '../use-cases/get-transfer/get-transfer.use-case';
import { InitiateTransferUseCase } from '../use-cases/initiate-transfer/initiate-transfer.use-case';
import { ListAccountsUseCase } from '../use-cases/list-accounts/list-accounts.use-case';
import { validateEnv } from './config/env.validate';
import { DrizzleAccountRepository } from './persistence/drizzle/account-repository';
import { drizzleProvider } from './persistence/drizzle/drizzle.provider';
import { DrizzleTransferRepository } from './persistence/drizzle/transfer-repository';
import { DrizzleUnitOfWork } from './persistence/drizzle/unit-of-work';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
  ],
  controllers: [AccountController, TransferController],
  providers: [
    drizzleProvider,
    {
      provide: ACCOUNT_GATEWAY,
      useClass: DrizzleAccountRepository,
    },
    {
      provide: TRANSFER_GATEWAY,
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
    CreateAccountUseCase,
    GetAccountUseCase,
    ListAccountsUseCase,
    InitiateTransferUseCase,
    GetTransferUseCase,
  ],
})
export class AppModule {}
