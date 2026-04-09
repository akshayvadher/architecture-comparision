import { Injectable } from '@nestjs/common';
import { EventStore } from '../infrastructure/event-store/event-store';
import {
  AccountNotFoundError,
  InvalidIdError,
} from '../domain/errors/domain-errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface EventStreamDto {
  type: string;
  data: unknown;
  version: number;
  timestamp: string;
}

@Injectable()
export class GetAccountEventsHandler {
  constructor(private readonly eventStore: EventStore) {}

  async execute(accountId: string): Promise<EventStreamDto[]> {
    if (!UUID_REGEX.test(accountId)) {
      throw new InvalidIdError(accountId);
    }

    const storedEvents = await this.eventStore.loadEvents(accountId);

    if (storedEvents.length === 0) {
      throw new AccountNotFoundError(accountId);
    }

    return storedEvents.map((event) => ({
      type: event.eventType,
      data: event.eventData,
      version: event.version,
      timestamp: event.timestamp.toISOString(),
    }));
  }
}
