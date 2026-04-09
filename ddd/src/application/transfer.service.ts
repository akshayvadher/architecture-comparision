import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Transfer } from '../domain/aggregates/transfer';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
  TransferNotFoundError,
} from '../domain/errors/domain-errors';
import type { DomainEvent } from '../domain/events/domain-event';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../domain/repositories/account-repository.interface';
import {
  TRANSFER_REPOSITORY,
  type TransferRepository,
} from '../domain/repositories/transfer-repository.interface';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../domain/repositories/unit-of-work.interface';
import { AccountId } from '../domain/value-objects/account-id';
import { Money } from '../domain/value-objects/money';
import { TransferId } from '../domain/value-objects/transfer-id';

export interface TransferResponse {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  timestamp: Date;
  status: string;
  events: { type: string; data: Record<string, unknown>; timestamp: Date }[];
}

@Injectable()
export class TransferService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
    @Inject(TRANSFER_REPOSITORY)
    private readonly transferRepository: TransferRepository,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async getTransferById(id: string): Promise<TransferResponse> {
    const transferId = TransferId.create(id);
    const transfer = await this.transferRepository.findById(transferId);
    if (!transfer) {
      throw new TransferNotFoundError(id);
    }
    return toTransferResponse(transfer);
  }

  async initiateTransfer(
    fromId: string,
    toId: string,
    amount: number,
  ): Promise<TransferResponse> {
    const fromAccountId = AccountId.create(fromId);
    const toAccountId = AccountId.create(toId);
    const money = this.validateAmount(amount);

    await this.validateAccountsExist(fromAccountId, toAccountId);

    const transferId = TransferId.create(randomUUID());
    const timestamp = new Date();

    try {
      return await this.executeTransfer(
        transferId,
        fromAccountId,
        toAccountId,
        money,
        timestamp,
      );
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        const failedTransfer = Transfer.failed(
          transferId,
          fromAccountId,
          toAccountId,
          money,
          timestamp,
          error.message,
        );
        await this.transferRepository.save(failedTransfer);
      }
      throw error;
    }
  }

  private validateAmount(amount: number): Money {
    const money = Money.create(amount);
    if (money.value === 0) {
      throw new InvalidAmountError();
    }
    return money;
  }

  private async validateAccountsExist(
    fromAccountId: AccountId,
    toAccountId: AccountId,
  ): Promise<void> {
    const source = await this.accountRepository.findById(fromAccountId);
    if (!source) {
      throw new AccountNotFoundError(fromAccountId.value);
    }

    const destination = await this.accountRepository.findById(toAccountId);
    if (!destination) {
      throw new AccountNotFoundError(toAccountId.value);
    }
  }

  private async executeTransfer(
    transferId: TransferId,
    fromAccountId: AccountId,
    toAccountId: AccountId,
    money: Money,
    timestamp: Date,
  ): Promise<TransferResponse> {
    const transfer = await this.unitOfWork.execute(
      async ({ accountRepository, transferRepository }) => {
        const sourceAccount = await accountRepository.findById(fromAccountId);
        if (!sourceAccount) {
          throw new AccountNotFoundError(fromAccountId.value);
        }
        const destAccount = await accountRepository.findById(toAccountId);
        if (!destAccount) {
          throw new AccountNotFoundError(toAccountId.value);
        }

        sourceAccount.debit(money);
        destAccount.credit(money);

        await accountRepository.updateBalance(
          sourceAccount.id,
          sourceAccount.balance,
        );
        await accountRepository.updateBalance(
          destAccount.id,
          destAccount.balance,
        );

        const completedTransfer = Transfer.completed(
          transferId,
          fromAccountId,
          toAccountId,
          money,
          timestamp,
        );
        await transferRepository.save(completedTransfer);

        return completedTransfer;
      },
    );

    return toTransferResponse(transfer);
  }
}

function toTransferResponse(transfer: Transfer): TransferResponse {
  return {
    id: transfer.id.value,
    fromAccountId: transfer.fromAccountId.value,
    toAccountId: transfer.toAccountId.value,
    amount: transfer.amount.value,
    timestamp: transfer.timestamp,
    status: transfer.status,
    events: transfer.domainEvents.map(toEventResponse),
  };
}

function toEventResponse(event: DomainEvent): {
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
} {
  return {
    type: event.type,
    data: event.data,
    timestamp: event.timestamp,
  };
}
