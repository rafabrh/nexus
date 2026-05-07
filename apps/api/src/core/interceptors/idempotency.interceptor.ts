import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  Inject,
} from '@nestjs/common';
import { type Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Idempotency interceptor.
 * If the request includes an `X-Request-Id` header or a `clientRequestId`
 * in the body, the response is cached in Redis for 5 minutes.
 * Duplicate requests within that window receive the cached response.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly TTL_SECONDS = 300; // 5 minutes

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const clientRequestId: string | undefined =
      request.headers['x-request-id'] ?? request.body?.clientRequestId;

    if (!clientRequestId) {
      return next.handle();
    }

    const key = `idempotency:${clientRequestId}`;
    const cached = await this.redis.get(key);

    if (cached) {
      return of(JSON.parse(cached));
    }

    return next.handle().pipe(
      tap(async (response) => {
        try {
          await this.redis.set(
            key,
            JSON.stringify(response),
            'EX',
            IdempotencyInterceptor.TTL_SECONDS,
          );
        } catch {
          // Silently ignore cache write failures
        }
      }),
    );
  }
}
