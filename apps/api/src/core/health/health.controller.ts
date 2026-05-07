import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  type HealthCheckResult,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';
import { EvolutionHealthIndicator } from './evolution.health';

@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly evolutionHealth: EvolutionHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Full health check (Redis + Evolution API)' })
  async check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.redisHealth.isHealthy('redis'),
      () => this.evolutionHealth.isHealthy('evolution-api'),
    ]);
  }

  @Get('liveness')
  @ApiOperation({ summary: 'Liveness probe — always returns OK if the process is alive' })
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — checks Redis connection' })
  async readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.redisHealth.isHealthy('redis'),
    ]);
  }
}
