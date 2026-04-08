import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { DRIZZLE, DrizzleDB } from '../database/drizzle.provider';
import { AccountsRepository } from '../accounts/accounts.repository';
import { TransfersRepository, TransferRow } from './transfers.repository';

export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  timestamp: Date;
  status: string;
}

@Injectable()
export class TransfersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly accountsRepository: AccountsRepository,
    private readonly transfersRepository: TransfersRepository,
  ) {}

  async getTransferById(id: string): Promise<Transfer> {
    this.validateUuid(id, 'transfer');

    const row = await this.transfersRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`Transfer with id ${id} not found`);
    }

    return this.toTransfer(row);
  }

  async executeTransfer(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<Transfer> {
    this.validateAmount(amount);
    this.validateUuid(fromAccountId, 'source');
    this.validateUuid(toAccountId, 'destination');

    const sourceExists = await this.accountsRepository.findById(fromAccountId);
    if (!sourceExists) {
      throw new NotFoundException(`Source account with id ${fromAccountId} not found`);
    }

    const destinationExists = await this.accountsRepository.findById(toAccountId);
    if (!destinationExists) {
      throw new NotFoundException(`Destination account with id ${toAccountId} not found`);
    }

    const transferId = uuidv4();
    const timestamp = new Date();

    try {
      const row = await this.db.transaction(async (tx) => {
        const sourceAccount = await this.accountsRepository.findByIdForUpdate(tx, fromAccountId);
        const destinationAccount = await this.accountsRepository.findByIdForUpdate(tx, toAccountId);

        if (!sourceAccount || !destinationAccount) {
          throw new NotFoundException('Account disappeared during transaction');
        }

        const sourceBalance = parseFloat(sourceAccount.balance);
        if (sourceBalance < amount) {
          throw new InsufficientFundsError(fromAccountId, sourceBalance, amount);
        }

        const newSourceBalance = (sourceBalance - amount).toFixed(2);
        const newDestinationBalance = (parseFloat(destinationAccount.balance) + amount).toFixed(2);

        await this.accountsRepository.updateBalance(tx, fromAccountId, newSourceBalance);
        await this.accountsRepository.updateBalance(tx, toAccountId, newDestinationBalance);

        return this.transfersRepository.insert(tx, {
          id: transferId,
          fromAccountId,
          toAccountId,
          amount: amount.toFixed(2),
          timestamp,
          status: 'COMPLETED',
        });
      });

      return this.toTransfer(row);
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        await this.transfersRepository.insertWithDefaultDb({
          id: transferId,
          fromAccountId,
          toAccountId,
          amount: amount.toFixed(2),
          timestamp,
          status: 'FAILED',
        });

        throw new BadRequestException(
          `Insufficient funds in account ${fromAccountId}: available ${error.availableBalance}, requested ${error.requestedAmount}`,
        );
      }
      throw error;
    }
  }

  private validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be greater than zero');
    }
  }

  private validateUuid(id: string, label: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new BadRequestException(`Invalid ${label} id format: ${id}`);
    }
  }

  private toTransfer(row: TransferRow): Transfer {
    return {
      id: row.id,
      fromAccountId: row.fromAccountId,
      toAccountId: row.toAccountId,
      amount: parseFloat(row.amount),
      timestamp: row.timestamp,
      status: row.status,
    };
  }
}

class InsufficientFundsError extends Error {
  constructor(
    public readonly accountId: string,
    public readonly availableBalance: number,
    public readonly requestedAmount: number,
  ) {
    super(`Insufficient funds in account ${accountId}`);
  }
}
