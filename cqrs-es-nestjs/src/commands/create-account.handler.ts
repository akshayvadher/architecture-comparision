import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateAccountCommand } from './create-account.command';
import { Account } from '../domain/aggregates/account';
import { EventStore, DomainEvent } from '../infrastructure/event-store/event-store';
import { AccountProjector } from '../projections/account.projector';

@CommandHandler(CreateAccountCommand)
export class CreateAccountHandler implements ICommandHandler<CreateAccountCommand> {
  constructor(
    private readonly eventStore: EventStore,
    private readonly accountProjector: AccountProjector,
  ) {}

  async execute(command: CreateAccountCommand) {
    const id = crypto.randomUUID();
    const account = Account.create(id, command.owner, command.balance);

    const uncommittedEvents = account.getUncommittedEvents();
    const domainEvents: DomainEvent[] = uncommittedEvents.map((event) => ({
      type: event.constructor.name,
      data: { ...event } as Record<string, unknown>,
    }));

    await this.eventStore.append(id, 'Account', domainEvents, 0);

    for (const event of domainEvents) {
      await this.accountProjector.project(event);
    }

    return {
      id: account.id,
      owner: account.owner,
      balance: account.balance,
      status: account.status,
    };
  }
}
