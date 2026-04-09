import { Injectable } from '@nestjs/common';
import { Account } from '../domain/aggregates/account';
import type { EventStore } from '../infrastructure/event-store/event-store';
import type { AccountProjector } from '../projections/account.projector';

export interface CreateAccountResult {
  id: string;
  owner: string;
  balance: number;
  status: string;
}

@Injectable()
export class CreateAccountHandler {
  constructor(
    private readonly eventStore: EventStore,
    private readonly accountProjector: AccountProjector,
  ) {}

  async execute(owner: string, balance: number): Promise<CreateAccountResult> {
    const id = crypto.randomUUID();
    const [account, event] = Account.create(id, owner, balance);

    await this.eventStore.append(id, 'Account', [event], 0);
    await this.accountProjector.project(event);

    return {
      id: account.id,
      owner: account.owner,
      balance: account.balance,
      status: account.status,
    };
  }
}
