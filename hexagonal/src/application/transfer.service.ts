import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  Transfer,
  createCompletedTransfer,
  createFailedTransfer,
} from '../domain/models/transfer';
import {
  AccountNotFoundError,
  InsufficientFundsError,
  InvalidAmountError,
  InvalidIdError,
  TransferNotFoundError,
} from '../domain/errors/domain-errors';
import { UNIT_OF_WORK, UnitOfWork } from '../domain/ports/unit-of-work.port';
import {
  TRANSFER_REPOSITORY,
  TransferRepositoryPort,
} from '../domain/ports/transfer-repository.port';
import {
  ACCOUNT_REPOSITORY,
  AccountRepositoryPort,
} from '../domain/ports/account-repository.port';

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
    private readonly transferRepository: TransferRepositoryPort,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepositoryPort,
  ) {}

  async executeTransfer(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<Transfer> {
    validateAmount(amount);
    validateUuid(fromAccountId);
    validateUuid(toAccountId);

    await this.verifyAccountExists(fromAccountId, 'Source');
    await this.verifyAccountExists(toAccountId, 'Destination');

    const transferId = uuidv4();

    try {
      return await this.unitOfWork.execute(async ({ accounts, transfers }) => {
        const source = await accounts.findById(fromAccountId);
        const destination = await accounts.findById(toAccountId);

        if (!source || !destination) {
          throw new AccountNotFoundError(fromAccountId);
        }

        if (source.balance < amount) {
          throw new InsufficientFundsError(
            fromAccountId,
            source.balance,
            amount,
          );
        }

        await accounts.updateBalance(fromAccountId, source.balance - amount);
        await accounts.updateBalance(
          toAccountId,
          destination.balance + amount,
        );

        const transfer = createCompletedTransfer(
          transferId,
          fromAccountId,
          toAccountId,
          amount,
        );
        return transfers.save(transfer);
      });
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

  private async verifyAccountExists(
    id: string,
    label: string,
  ): Promise<void> {
    const account = await this.accountRepository.findById(id);
    if (!account) {
      throw new AccountNotFoundError(id);
    }
  }
}
