import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
  PrometheusModule,
} from '@willsoto/nestjs-prometheus';
import { DbPoolMetricsService } from './db-pool-metrics.service';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      path: '/metrics',
    }),
  ],
  providers: [
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
    }),
    makeGaugeProvider({
      name: 'pg_pool_total_connections',
      help: 'Total connections in the pg pool',
    }),
    makeGaugeProvider({
      name: 'pg_pool_idle_connections',
      help: 'Idle connections in the pg pool',
    }),
    makeGaugeProvider({
      name: 'pg_pool_waiting_clients',
      help: 'Clients waiting for a pg pool connection',
    }),
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    DbPoolMetricsService,
  ],
})
export class MetricsModule {}
