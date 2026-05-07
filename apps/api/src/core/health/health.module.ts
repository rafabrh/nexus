import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { EvolutionHealthIndicator } from './evolution.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, EvolutionHealthIndicator],
  exports: [RedisHealthIndicator, EvolutionHealthIndicator],
})
export class HealthModule {}
