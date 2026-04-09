import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Account } from '../domain/aggregates/account';
import { AccountNotFoundError } from '../domain/errors/domain-errors';
import {
  ACCOUNT_REPOSITORY,
  type AccountRepository,
} from '../domain/repositories/account-repository.interface';
import { AccountId } from '../domain/value-objects/account-id';
import { Money } from '../domain/value-objects/money';

@Injectable()
export class AccountService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepository,
  ) {}

  async createAccount(
    owner: string,
    balance: number,
  ): Promise<{ id: string; owner: string; balance: number; status: string }> {
    const accountId = AccountId.create(randomUUID());
    const money = Money.create(balance);
    const account = new Account(accountId, owner, money, 'ACTIVE');
    await this.accountRepository.save(account);
    return toAccountResponse(account);
  }

  async getAccountById(
    id: string,
  ): Promise<{ id: string; owner: string; balance: number; status: string }> {
    const accountId = AccountId.create(id);
    const account = await this.accountRepository.findById(accountId);
    if (!account) {
      throw new AccountNotFoundError(id);
    }
    return toAccountResponse(account);
  }

  async listAccounts(): Promise<
    { id: string; owner: string; balance: number; status: string }[]
  > {
    const accounts = await this.accountRepository.findAll();
    return accounts.map(toAccountResponse);
  }
}

function toAccountResponse(account: Account): {
  id: string;
  owner: string;
  balance: number;
  status: string;
} {
  return {
    id: account.id.value,
    owner: account.owner,
    balance: account.balance.value,
    status: account.status,
  };
}
