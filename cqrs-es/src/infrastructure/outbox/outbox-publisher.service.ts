import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, isNull } from 'drizzle-orm';
import type { Env } from '../config/env.schema';
import { DRIZZLE, type DrizzleDB } from '../persistence/database';
import { outbox } from '../persistence/schema';

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 100;

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }
    this.timer = setInterval(() => {
      void this.flush();
    }, POLL_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async flush(): Promise<void> {
    const batch = await this.db
      .select()
      .from(outbox)
      .where(isNull(outbox.publishedAt))
      .limit(BATCH_SIZE);

    if (batch.length === 0) {
      return;
    }

    for (const event of batch) {
      this.logger.log({ msg: 'outbox.publish', event });
      await this.db
        .update(outbox)
        .set({ publishedAt: new Date() })
        .where(eq(outbox.id, event.id));
    }
  }
}
