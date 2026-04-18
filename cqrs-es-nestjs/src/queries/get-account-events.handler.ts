import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  AccountNotFoundError,
  InvalidIdError,
} from '../domain/errors/domain-errors';
import { EventStore } from '../infrastructure/event-store/event-store';
import { GetAccountEventsQuery } from './get-account-events.query';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@QueryHandler(GetAccountEventsQuery)
export class GetAccountEventsHandler
  implements IQueryHandler<GetAccountEventsQuery>
{
  constructor(private readonly eventStore: EventStore) {}

  async execute(query: GetAccountEventsQuery) {
    if (!UUID_REGEX.test(query.accountId)) {
      throw new InvalidIdError(query.accountId);
    }

    const storedEvents = await this.eventStore.loadEvents(query.accountId);

    if (storedEvents.length === 0) {
      throw new AccountNotFoundError(query.accountId);
    }

    return storedEvents.map((event) => ({
      type: event.eventType,
      data: event.eventData,
      version: event.version,
      timestamp: event.timestamp.toISOString(),
    }));
  }
}
