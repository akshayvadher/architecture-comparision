import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DrizzleHealthIndicator } from './drizzle-health.indicator';
import { HealthController } from './health.controller';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DrizzleHealthIndicator, ReadinessService],
})
export class HealthModule {}
