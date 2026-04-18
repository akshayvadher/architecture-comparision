import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
  InvalidIdError,
} from '../../entities/errors';
import { Transfer } from '../../entities/transfer';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from '../gateways/account.gateway';
import {
  TRANSFER_GATEWAY,
  type TransferGateway,
} from '../gateways/transfer.gateway';
import {
  UNIT_OF_WORK,
  type UnitOfWorkGateway,
} from '../gateways/unit-of-work.gateway';
import type { InitiateTransferInput } from './initiate-transfer.input';
import type { InitiateTransferOutput } from './initiate-transfer.output';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class InitiateTransferUseCase {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accountGateway: AccountGateway,
    @Inject(TRANSFER_GATEWAY) private readonly transferGateway: TransferGateway,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWorkGateway,
  ) {}

  async execute(input: InitiateTransferInput): Promise<InitiateTransferOutput> {
    this.validateInput(input);
    await this.validateAccountsExist(input.fromAccountId, input.toAccountId);

    try {
      return await this.executeTransfer(input);
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        await this.persistFailedTransfer(input);
      }
      throw error;
    }
  }

  private async executeTransfer(
    input: InitiateTransferInput,
  ): Promise<InitiateTransferOutput> {
    return this.unitOfWork.execute(
      async ({ accountGateway, transferGateway }) => {
        const sourceAccount = await accountGateway.findById(
          input.fromAccountId,
        );
        if (!sourceAccount) {
          throw new AccountNotFoundError(input.fromAccountId);
        }
        const destinationAccount = await accountGateway.findById(
          input.toAccountId,
        );
        if (!destinationAccount) {
          throw new AccountNotFoundError(input.toAccountId);
        }

        sourceAccount.debit(input.amount);
        destinationAccount.credit(input.amount);

        await accountGateway.updateBalance(
          sourceAccount.id,
          sourceAccount.balance,
        );
        await accountGateway.updateBalance(
          destinationAccount.id,
          destinationAccount.balance,
        );

        const transfer = await transferGateway.save(
          new Transfer(
            uuid(),
            input.fromAccountId,
            input.toAccountId,
            input.amount,
            new Date(),
            'COMPLETED',
          ),
        );

        return this.toOutput(transfer);
      },
    );
  }

  private async validateAccountsExist(
    fromAccountId: string,
    toAccountId: string,
  ): Promise<void> {
    const source = await this.accountGateway.findById(fromAccountId);
    if (!source) {
      throw new AccountNotFoundError(fromAccountId);
    }

    const destination = await this.accountGateway.findById(toAccountId);
    if (!destination) {
      throw new AccountNotFoundError(toAccountId);
    }
  }

  private async persistFailedTransfer(
    input: InitiateTransferInput,
  ): Promise<void> {
    await this.transferGateway.save(
      new Transfer(
        uuid(),
        input.fromAccountId,
        input.toAccountId,
        input.amount,
        new Date(),
        'FAILED',
      ),
    );
  }

  private validateInput(input: InitiateTransferInput): void {
    if (!UUID_REGEX.test(input.fromAccountId)) {
      throw new InvalidIdError(input.fromAccountId);
    }
    if (!UUID_REGEX.test(input.toAccountId)) {
      throw new InvalidIdError(input.toAccountId);
    }
    if (input.amount <= 0) {
      throw new InvalidAmountError();
    }
  }

  private toOutput(transfer: Transfer): InitiateTransferOutput {
    return {
      id: transfer.id,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amount: transfer.amount,
      timestamp: transfer.timestamp,
      status: transfer.status,
    };
  }
}
