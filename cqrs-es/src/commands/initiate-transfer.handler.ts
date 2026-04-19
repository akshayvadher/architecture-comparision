import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Account, type AccountSnapshot } from '../domain/aggregates/account';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
} from '../domain/errors/domain-errors';
import type { AccountEvent } from '../domain/events/account-events';
import type {
  TransferCompletedEvent,
  TransferFailedEvent,
  TransferInitiatedEvent,
} from '../domain/events/transfer-events';
import type { Env } from '../infrastructure/config/env.schema';
import { EventStore } from '../infrastructure/event-store/event-store';
import { AccountProjector } from '../projections/account.projector';
import { TransferProjector } from '../projections/transfer.projector';

export interface TransferResult {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  timestamp: string;
  status: 'COMPLETED' | 'FAILED';
}

@Injectable()
export class InitiateTransferHandler {
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

  async execute(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<TransferResult> {
    if (amount <= 0) {
      throw new InvalidAmountError();
    }

    const sourceAccount = await this.loadAccount(fromAccountId);
    const destinationAccount = await this.loadAccount(toAccountId);

    const transferId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const initiatedEvent = buildTransferInitiatedEvent(
      transferId,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
    );

    try {
      const debitedEvent = sourceAccount.debit(amount, transferId);
      const creditedEvent = destinationAccount.credit(amount, transferId);

      return await this.persistSuccessfulTransfer(
        transferId,
        fromAccountId,
        toAccountId,
        amount,
        timestamp,
        initiatedEvent,
        debitedEvent,
        creditedEvent,
        sourceAccount.version,
        destinationAccount.version,
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
      const accountEvents = toAccountEvents(newerEvents);
      return Account.replayFromSnapshot(
        snapshot.state as AccountSnapshot,
        accountEvents,
      );
    }

    const storedEvents = await this.eventStore.loadEvents(accountId);
    if (storedEvents.length === 0) {
      throw new AccountNotFoundError(accountId);
    }

    return Account.reconstitute(toAccountEvents(storedEvents));
  }

  private async maybeSnapshotAccount(
    accountId: string,
    newVersion: number,
  ): Promise<void> {
    if (newVersion % this.snapshotEveryNEvents !== 0) {
      return;
    }
    const events = await this.eventStore.loadEvents(accountId);
    const account = Account.reconstitute(toAccountEvents(events));
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
    initiatedEvent: TransferInitiatedEvent,
    debitedEvent: ReturnType<Account['debit']>,
    creditedEvent: ReturnType<Account['credit']>,
    sourceVersion: number,
    destinationVersion: number,
  ): Promise<TransferResult> {
    const completedEvent = buildTransferCompletedEvent(transferId, timestamp);

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
        events: [debitedEvent],
        expectedVersion: sourceVersion,
      },
      {
        aggregateId: toAccountId,
        aggregateType: 'Account',
        events: [creditedEvent],
        expectedVersion: destinationVersion,
      },
    ]);

    await this.accountProjector.project(debitedEvent);
    await this.accountProjector.project(creditedEvent);
    await this.transferProjector.projectCompleted(
      transferId,
      fromAccountId,
      toAccountId,
      amount,
      timestamp,
    );

    await this.maybeSnapshotAccount(fromAccountId, sourceVersion + 1);
    await this.maybeSnapshotAccount(toAccountId, destinationVersion + 1);

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
    initiatedEvent: TransferInitiatedEvent,
  ): Promise<TransferResult> {
    const failedEvent = buildTransferFailedEvent(transferId, timestamp);

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

function toAccountEvents(
  stored: Array<{ eventType: string; eventData: unknown }>,
): AccountEvent[] {
  return stored.map((e) => ({
    type: e.eventType,
    data: e.eventData as Record<string, unknown>,
  })) as AccountEvent[];
}

function buildTransferInitiatedEvent(
  transferId: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  timestamp: string,
): TransferInitiatedEvent {
  return {
    type: 'TransferInitiated',
    data: { transferId, fromAccountId, toAccountId, amount, timestamp },
  };
}

function buildTransferCompletedEvent(
  transferId: string,
  timestamp: string,
): TransferCompletedEvent {
  return {
    type: 'TransferCompleted',
    data: { transferId, timestamp },
  };
}

function buildTransferFailedEvent(
  transferId: string,
  timestamp: string,
): TransferFailedEvent {
  return {
    type: 'TransferFailed',
    data: { transferId, reason: 'Insufficient funds', timestamp },
  };
}
