import { Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { Account } from '../../entities/account';
import {
  ACCOUNT_GATEWAY,
  type AccountGateway,
} from '../gateways/account.gateway';
import type { CreateAccountInput } from './create-account.input';
import type { CreateAccountOutput } from './create-account.output';

@Injectable()
export class CreateAccountUseCase {
  constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly accountGateway: AccountGateway,
  ) {}

  async execute(input: CreateAccountInput): Promise<CreateAccountOutput> {
    const account = new Account(uuid(), input.owner, input.balance, 'ACTIVE');
    const saved = await this.accountGateway.save(account);
    return {
      id: saved.id,
      owner: saved.owner,
      balance: saved.balance,
      status: saved.status,
    };
  }
}
