import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { drizzleProvider } from './persistence/database';
import { EventStore } from './event-store/event-store';
import { CreateAccountHandler } from '../commands/create-account.handler';
import { InitiateTransferHandler } from '../commands/initiate-transfer.handler';
import { GetAccountHandler } from '../queries/get-account.handler';
import { ListAccountsHandler } from '../queries/list-accounts.handler';
import { GetTransferHandler } from '../queries/get-transfer.handler';
import { GetAccountEventsHandler } from '../queries/get-account-events.handler';
import { AccountProjector } from '../projections/account.projector';
import { TransferProjector } from '../projections/transfer.projector';
import { AccountController } from './rest/account.controller';
import { TransferController } from './rest/transfer.controller';
import { DomainErrorFilter } from './rest/error-filter';

@Module({
  imports: [CqrsModule.forRoot()],
  controllers: [AccountController, TransferController],
  providers: [
    drizzleProvider,
    EventStore,
    CreateAccountHandler,
    InitiateTransferHandler,
    GetAccountHandler,
    ListAccountsHandler,
    GetTransferHandler,
    GetAccountEventsHandler,
    AccountProjector,
    TransferProjector,
    {
      provide: APP_FILTER,
      useClass: DomainErrorFilter,
    },
  ],
})
export class AppModule {}
