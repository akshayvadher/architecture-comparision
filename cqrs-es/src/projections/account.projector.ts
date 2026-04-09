import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../infrastructure/persistence/database';
import { accountReadModel, events } from '../infrastructure/persistence/schema';
import { DomainEvent } from '../infrastructure/event-store/event-store';
import { asc } from 'drizzle-orm';

@Injectable()
export class AccountProjector {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async project(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case 'AccountCreated':
        return this.handleAccountCreated(event);
      case 'AccountDebited':
        return this.handleAccountDebited(event);
      case 'AccountCredited':
        return this.handleAccountCredited(event);
    }
  }

  private async handleAccountCreated(event: DomainEvent): Promise<void> {
    const data = event.data as {
      accountId: string;
      owner: string;
      balance: number;
      status: string;
    };

    await this.db.insert(accountReadModel).values({
      id: data.accountId,
      owner: data.owner,
      balance: String(data.balance),
      status: data.status,
    });
  }

  private async handleAccountDebited(event: DomainEvent): Promise<void> {
    const data = event.data as { accountId: string; amount: number };

    await this.db
      .update(accountReadModel)
      .set({
        balance: sql`${accountReadModel.balance}::numeric - ${data.amount}`,
      })
      .where(eq(accountReadModel.id, data.accountId));
  }

  private async handleAccountCredited(event: DomainEvent): Promise<void> {
    const data = event.data as { accountId: string; amount: number };

    await this.db
      .update(accountReadModel)
      .set({
        balance: sql`${accountReadModel.balance}::numeric + ${data.amount}`,
      })
      .where(eq(accountReadModel.id, data.accountId));
  }

  async rebuild(): Promise<void> {
    await this.db.delete(accountReadModel);

    const allEvents = await this.db
      .select()
      .from(events)
      .where(eq(events.aggregateType, 'Account'))
      .orderBy(asc(events.version));

    for (const storedEvent of allEvents) {
      await this.project({
        type: storedEvent.eventType,
        data: storedEvent.eventData as Record<string, unknown>,
      });
    }
  }
}
