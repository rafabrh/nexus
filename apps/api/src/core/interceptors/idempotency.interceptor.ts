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
 *
 * The cache key is namespaced by tenant (`instancia`) and user (`sub`) so a
 * client-controlled `clientRequestId` can never read across tenant/user
 * boundaries. The `JwtAuthGuard` populates `request.instancia` and
 * `request.user` (the JWT payload) before this interceptor runs. Requests
 * without an authenticated context (which should not happen for the routes
 * that opt into this interceptor) fall back to an `anon:<ip>` namespace so
 * unrelated callers still cannot collide.
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

    const key = `idempotency:${this.namespace(request)}:${clientRequestId}`;
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

  /**
   * Builds the per-request namespace for the idempotency key so a
   * client-controlled `clientRequestId` is always scoped to the caller's
   * tenant and user. Authenticated routes yield `<instancia>:<sub>`; the
   * rare unauthenticated request falls back to `anon:<ip>` — never a shared
   * bucket that could leak one caller's cached response to another.
   */
  private namespace(request: {
    instancia?: string;
    user?: { sub?: string; instancia?: string };
    ip?: string;
    socket?: { remoteAddress?: string };
  }): string {
    const tenant = request.instancia ?? request.user?.instancia;
    if (tenant) {
      const sub = request.user?.sub ?? 'nouser';
      return `${tenant}:${sub}`;
    }

    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    return `anon:${ip}`;
  }
}
