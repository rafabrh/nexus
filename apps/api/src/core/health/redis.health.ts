import { Injectable, Inject } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const result = await this.redis.ping();
      const isHealthy = result === 'PONG';

      const status = this.getStatus(key, isHealthy, {
        response: result,
      });

      if (isHealthy) {
        return status;
      }

      throw new HealthCheckError('Redis ping failed', status);
    } catch (error) {
      if (error instanceof HealthCheckError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, { error: message }),
      );
    }
  }
}
