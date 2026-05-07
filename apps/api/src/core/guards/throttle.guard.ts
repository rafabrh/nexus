import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Rate limit guard per tenant using Redis sliding window.
 * Default: 100 requests per 60 seconds per tenant.
 * Applies only to authenticated requests (requires request.instancia).
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly logger = new Logger(ThrottleGuard.name);
  private readonly maxRequests: number;
  private readonly windowSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    this.maxRequests = parseInt(process.env.THROTTLE_MAX ?? '100', 10);
    this.windowSeconds = parseInt(process.env.THROTTLE_WINDOW ?? '60', 10);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const instancia: string | undefined = request.instancia;

    // Skip throttle for unauthenticated routes (auth endpoints)
    if (!instancia) {
      return true;
    }

    const key = `throttle:${instancia}`;
    const now = Date.now();
    const windowStart = now - this.windowSeconds * 1000;

    try {
      const pipeline = this.redis.pipeline();
      // Remove entries outside the window
      pipeline.zremrangebyscore(key, 0, windowStart);
      // Count entries in the current window
      pipeline.zcard(key);
      // Add the current request
      pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
      // Set TTL on the key
      pipeline.expire(key, this.windowSeconds);

      const results = await pipeline.exec();

      if (!results) {
        return true;
      }

      // zcard result is at index 1
      const currentCount = (results[1]?.[1] as number) ?? 0;

      if (currentCount >= this.maxRequests) {
        this.logger.warn(
          `Rate limit exceeded for tenant ${instancia}: ${currentCount}/${this.maxRequests}`,
        );
        throw new HttpException(
          {
            type: 'https://httpstatuses.com/429',
            title: 'Too Many Requests',
            status: 429,
            detail: `Rate limit exceeded. Max ${this.maxRequests} requests per ${this.windowSeconds}s.`,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // If Redis fails, allow the request (fail open)
      this.logger.error(
        `Throttle guard Redis error: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return true;
    }
  }
}
