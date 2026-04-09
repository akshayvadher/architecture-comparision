import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InitiateTransferCommand } from './initiate-transfer.command';
import { Account } from '../domain/aggregates/account';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
} from '../domain/errors/domain-errors';
import {
  TransferInitiated,
  TransferCompleted,
  TransferFailed,
} from '../domain/events/transfer-events';
import { EventStore, DomainEvent } from '../infrastructure/event-store/event-store';
import { AccountProjector } from '../projections/account.projector';
import { TransferProjector } from '../projections/transfer.projector';

interface TransferResult {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  timestamp: string;
  status: 'COMPLETED' | 'FAILED';
}

@CommandHandler(InitiateTransferCommand)
export class InitiateTransferHandler
  implements ICommandHandler<InitiateTransferCommand>
{
  constructor(
    private readonly eventStore: EventStore,
    private readonly accountProjector: AccountProjector,
    private readonly transferProjector: TransferProjector,
  ) {}

  async execute(command: InitiateTransferCommand): Promise<TransferResult> {
    const { fromAccountId, toAccountId, amount } = command;

    if (amount <= 0) {
      throw new InvalidAmountError();
    }

    const sourceAccount = await this.loadAccount(fromAccountId);
    const destinationAccount = await this.loadAccount(toAccountId);

    const transferId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const initiatedEvent = buildDomainEvent(
      new TransferInitiated(transferId, fromAccountId, toAccountId, amount, timestamp),
    );

    const sourceVersion = sourceAccount.version;
    const destinationVersion = destinationAccount.version;

    try {
      sourceAccount.debit(amount, transferId);
      destinationAccount.credit(amount, transferId);

      return await this.persistSuccessfulTransfer(
        transferId,
        fromAccountId,
        toAccountId,
        amount,
        timestamp,
        initiatedEvent,
        sourceAccount,
        sourceVersion,
        destinationAccount,
        destinationVersion,
      );
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        return this.persistFailedTransfer(
          transferId,
          fromAccountId,
          toAccountId,
          amount,
          timestamp,
          initiatedEvent,
        );
      }
      throw error;
    }
  }

  private async loadAccount(accountId: string): Promise<Account> {
    const storedEvents = await this.eventStore.loadEvents(accountId);
    if (storedEvents.length === 0) {
      throw new AccountNotFoundError(accountId);
    }

    const deserialized = this.eventStore.deserializeEvents(storedEvents);
    const account = new Account();
    account.loadFromHistory(deserialized);
    return account;
  }

  private async persistSuccessfulTransfer(
    transferId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    timestamp: string,
    initiatedEvent: DomainEvent,
    sourceAccount: Account,
    sourceVersion: number,
    destinationAccount: Account,
    destinationVersion: number,
  ): Promise<TransferResult> {
    const completedEvent = buildDomainEvent(
      new TransferCompleted(transferId, timestamp),
    );

    const sourceEvents = extractUncommittedDomainEvents(sourceAccount);
    const destinationEvents = extractUncommittedDomainEvents(destinationAccount);

    await this.eventStore.appendMultiple([
      {
        aggregateId: transferId,
        aggregateType: 'Transfer',
        events: [initiatedEvent, completedEvent],
        expectedVersion: 0,
      },
      {
        aggregateId: fromAccountId,
        aggregateType: 'Account',
        events: sourceEvents,
        expectedVersion: sourceVersion,
      },
      {
        aggregateId: toAccountId,
        aggregateType: 'Account',
        events: destinationEvents,
        expectedVersion: destinationVersion,
      },
    ]);

    for (const event of sourceEvents) {
      await this.accountProjector.project(event);
    }
    for (const event of destinationEvents) {
      await this.accountProjector.project(event);
    }

    await this.transferProjector.projectCompleted(
      transferId,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
    );

    return {
      id: transferId,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
      status: 'COMPLETED',
    };
  }

  private async persistFailedTransfer(
    transferId: string,
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    timestamp: string,
    initiatedEvent: DomainEvent,
  ): Promise<TransferResult> {
    const failedEvent = buildDomainEvent(
      new TransferFailed(transferId, 'Insufficient funds', timestamp),
    );

    await this.eventStore.appendMultiple([
      {
        aggregateId: transferId,
        aggregateType: 'Transfer',
        events: [initiatedEvent, failedEvent],
        expectedVersion: 0,
      },
    ]);

    await this.transferProjector.projectFailed(
      transferId,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
    );

    return {
      id: transferId,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
      status: 'FAILED',
    };
  }
}

function extractUncommittedDomainEvents(aggregate: Account): DomainEvent[] {
  return aggregate.getUncommittedEvents().map(buildDomainEvent);
}

function buildDomainEvent(event: object): DomainEvent {
  return {
    type: event.constructor.name,
    data: { ...event } as Record<string, unknown>,
  };
}
