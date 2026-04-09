import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
  InvalidIdError,
  TransferNotFoundError,
} from '../domain/model/errors';
import { createFailedTransfer, type Transfer } from '../domain/model/transfer';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../domain/services/account-repository.interface';
import { executeTransfer } from '../domain/services/transfer-domain.service';
import {
  TRANSFER_REPOSITORY,
  type TransferRepository,
} from '../domain/services/transfer-repository.interface';
import {
  UNIT_OF_WORK,
  type UnitOfWork,
} from '../domain/services/unit-of-work.interface';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(id: string): void {
  if (!UUID_REGEX.test(id)) {
    throw new InvalidIdError(id);
  }
}

function validateAmount(amount: number): void {
  if (amount <= 0) {
    throw new InvalidAmountError();
  }
}

@Injectable()
export class TransferService {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(TRANSFER_REPOSITORY)
    private readonly transferRepository: TransferRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
  ) {}

  async executeTransfer(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<Transfer> {
    validateAmount(amount);
    validateUuid(fromAccountId);
    validateUuid(toAccountId);

    await this.verifyAccountExists(fromAccountId);
    await this.verifyAccountExists(toAccountId);

    const transferId = uuidv4();

    try {
      return await this.unitOfWork.execute(
        async ({ accountRepository, transferRepository }) => {
          const source = await accountRepository.findById(fromAccountId);
          const destination = await accountRepository.findById(toAccountId);

          if (!source || !destination) {
            throw new AccountNotFoundError(fromAccountId);
          }

          const result = executeTransfer(
            transferId,
            source,
            destination,
            amount,
          );

          await accountRepository.updateBalance(
            result.debitedSource.id,
            result.debitedSource.balance,
          );
          await accountRepository.updateBalance(
            result.creditedDestination.id,
            result.creditedDestination.balance,
          );

          return transferRepository.save(result.transfer);
        },
      );
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        const failedTransfer = createFailedTransfer(
          transferId,
          fromAccountId,
          toAccountId,
          amount,
        );
        await this.transferRepository.save(failedTransfer);
        throw error;
      }
      throw error;
    }
  }

  async getTransferById(id: string): Promise<Transfer> {
    validateUuid(id);
    const transfer = await this.transferRepository.findById(id);
    if (!transfer) {
      throw new TransferNotFoundError(id);
    }
    return transfer;
  }

  private async verifyAccountExists(id: string): Promise<void> {
    const account = await this.accountRepository.findById(id);
    if (!account) {
      throw new AccountNotFoundError(id);
    }
  }
}
