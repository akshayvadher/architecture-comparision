import { ConfigService } from '@nestjs/config';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Account, type AccountSnapshot } from '../domain/aggregates/account';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
} from '../domain/errors/domain-errors';
import {
  TransferCompleted,
  TransferFailed,
  TransferInitiated,
} from '../domain/events/transfer-events';
import type { Env } from '../infrastructure/config/env.schema';
import {
  type DomainEvent,
  EventStore,
} from '../infrastructure/event-store/event-store';
import { AccountProjector } from '../projections/account.projector';
import { TransferProjector } from '../projections/transfer.projector';
import { InitiateTransferCommand } from './initiate-transfer.command';

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
  private readonly snapshotEveryNEvents: number;

  constructor(
    private readonly eventStore: EventStore,
    private readonly accountProjector: AccountProjector,
    private readonly transferProjector: TransferProjector,
    configService: ConfigService<Env, true>,
  ) {
    this.snapshotEveryNEvents = configService.get('SNAPSHOT_EVERY_N_EVENTS', {
      infer: true,
    });
  }

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
      new TransferInitiated(
        transferId,
        fromAccountId,
        toAccountId,
        amount,
        timestamp,
      ),
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
    const snapshot = await this.eventStore.loadSnapshot(accountId, 'Account');

    if (snapshot) {
      const newerEvents = await this.eventStore.loadEventsSince(
        accountId,
        snapshot.version,
      );
      const account = Account.fromSnapshot(snapshot.state as AccountSnapshot);
      if (newerEvents.length > 0) {
        const deserialized = this.eventStore.deserializeEvents(newerEvents);
        account.loadFromHistory(deserialized);
      }
      return account;
    }

    const storedEvents = await this.eventStore.loadEvents(accountId);
    if (storedEvents.length === 0) {
      throw new AccountNotFoundError(accountId);
    }

    const deserialized = this.eventStore.deserializeEvents(storedEvents);
    const account = new Account();
    account.loadFromHistory(deserialized);
    return account;
  }

  private async maybeSnapshotAccount(
    accountId: string,
    newVersion: number,
  ): Promise<void> {
    if (newVersion % this.snapshotEveryNEvents !== 0) {
      return;
    }
    const storedEvents = await this.eventStore.loadEvents(accountId);
    const deserialized = this.eventStore.deserializeEvents(storedEvents);
    const account = new Account();
    account.loadFromHistory(deserialized);
    await this.eventStore.saveSnapshot(
      accountId,
      'Account',
      account.version,
      account.toSnapshot(),
    );
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
    const destinationEvents =
      extractUncommittedDomainEvents(destinationAccount);

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

    await this.maybeSnapshotAccount(
      fromAccountId,
      sourceVersion + sourceEvents.length,
    );
    await this.maybeSnapshotAccount(
      toAccountId,
      destinationVersion + destinationEvents.length,
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
