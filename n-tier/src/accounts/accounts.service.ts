import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { AccountsRepository } from './accounts.repository';

export interface Account {
  id: string;
  owner: string;
  balance: number;
  status: string;
}

@Injectable()
export class AccountsService {
  constructor(private readonly accountsRepository: AccountsRepository) {}

  async createAccount(owner: string, balance: number): Promise<Account> {
    this.validateOwner(owner);
    this.validateBalance(balance);

    const row = await this.accountsRepository.insert({
      id: uuidv4(),
      owner,
      balance: balance.toString(),
      status: 'ACTIVE',
    });

    return this.toAccount(row);
  }

  async getAccountById(id: string): Promise<Account> {
    this.validateUuid(id);

    const row = await this.accountsRepository.findById(id);
    if (!row) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }

    return this.toAccount(row);
  }

  async getAllAccounts(): Promise<Account[]> {
    const rows = await this.accountsRepository.findAll();
    return rows.map((row) => this.toAccount(row));
  }

  private validateUuid(id: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw new BadRequestException(`Invalid account id format: ${id}`);
    }
  }

  private validateOwner(owner: string): void {
    if (!owner || owner.trim() === '') {
      throw new BadRequestException('Owner name is required');
    }
  }

  private validateBalance(balance: number): void {
    if (balance < 0) {
      throw new BadRequestException('Initial balance cannot be negative');
    }
  }

  private toAccount(row: { id: string; owner: string; balance: string; status: string }): Account {
    return {
      id: row.id,
      owner: row.owner,
      balance: parseFloat(row.balance),
      status: row.status,
    };
  }
}
