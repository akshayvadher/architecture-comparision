import { Inject, Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../persistence/database';
import { ReadinessService } from './readiness.service';

@Injectable()
export class DrizzleHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly readiness: ReadinessService,
  ) {
    super();
  }

  async pingCheck(key = 'database'): Promise<HealthIndicatorResult> {
    if (this.readiness.isShuttingDown()) {
      throw new HealthCheckError(
        'Shutting down',
        this.getStatus(key, false, { message: 'shutting down' }),
      );
    }
    try {
      await this.db.execute(sql`SELECT 1`);
      return this.getStatus(key, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'db unreachable';
      throw new HealthCheckError(
        'Drizzle check failed',
        this.getStatus(key, false, { message }),
      );
    }
  }
}
