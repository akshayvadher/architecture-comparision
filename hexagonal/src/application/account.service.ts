import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Account, createAccount } from '../domain/models/account';
import {
  ACCOUNT_REPOSITORY,
  AccountRepositoryPort,
} from '../domain/ports/account-repository.port';
import {
  AccountNotFoundError,
  InvalidIdError,
} from '../domain/errors/domain-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(id: string): void {
  if (!UUID_REGEX.test(id)) {
    throw new InvalidIdError(id);
  }
}

@Injectable()
export class AccountService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accountRepository: AccountRepositoryPort,
  ) {}

  async createAccount(owner: string, balance: number): Promise<Account> {
    const account = createAccount(uuidv4(), owner, balance);
    return this.accountRepository.save(account);
  }

  async getAccountById(id: string): Promise<Account> {
    validateUuid(id);
    const account = await this.accountRepository.findById(id);
    if (!account) {
      throw new AccountNotFoundError(id);
    }
    return account;
  }

  async getAllAccounts(): Promise<Account[]> {
    return this.accountRepository.findAll();
  }
}
