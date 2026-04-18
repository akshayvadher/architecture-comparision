import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import type { Gauge } from 'prom-client';
import { DatabaseConnection } from '../persistence/database';

const REFRESH_INTERVAL_MS = 5_000;

@Injectable()
export class DbPoolMetricsService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @InjectMetric('pg_pool_total_connections')
    private readonly total: Gauge<string>,
    @InjectMetric('pg_pool_idle_connections')
    private readonly idle: Gauge<string>,
    @InjectMetric('pg_pool_waiting_clients')
    private readonly waiting: Gauge<string>,
    private readonly connection: DatabaseConnection,
  ) {}

  onModuleInit(): void {
    this.refresh();
    this.timer = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS).unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private refresh(): void {
    const pool = this.connection.pool;
    this.total.set(pool.totalCount);
    this.idle.set(pool.idleCount);
    this.waiting.set(pool.waitingCount);
  }
}
