import { describe, it, expect, vi, beforeEach } from 'vitest';
import { of, lastValueFrom, type Observable } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * In-memory Redis double backed by a Map. `set` writes synchronously (before
 * the returned promise resolves) so a follow-up request observes the cache
 * deterministically — mirrors the `get`/`set` mocking style used by the other
 * api specs (see redis-throttler.storage.spec.ts).
 */
function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
  } as any;
}

/** ExecutionContext around a mutable request, as the JwtAuthGuard leaves it. */
function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** CallHandler that emits `response` and counts how many times it ran. */
function handlerEmitting(
  response: unknown,
): CallHandler & { calls: number } {
  const handler = {
    calls: 0,
    handle(): Observable<unknown> {
      handler.calls += 1;
      return of(response);
    },
  };
  return handler as CallHandler & { calls: number };
}

/** Authenticated request: tenant + user populated by the guard, optional reqId. */
function authedRequest(
  instancia: string,
  sub: string,
  clientRequestId?: string,
): Record<string, unknown> {
  return {
    instancia,
    user: { sub, instancia },
    headers: clientRequestId ? { 'x-request-id': clientRequestId } : {},
  };
}

async function run(
  interceptor: IdempotencyInterceptor,
  request: Record<string, unknown>,
  handler: CallHandler,
): Promise<unknown> {
  const obs = await interceptor.intercept(contextFor(request), handler);
  return lastValueFrom(obs as Observable<unknown>);
}

describe('IdempotencyInterceptor — tenant-namespaced cache key', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does NOT leak across tenants when the client-controlled reqId collides', async () => {
    const redis = makeRedis();
    const interceptor = new IdempotencyInterceptor(redis);

    // Tenant A primes the cache with its own data under reqId "REQ-1".
    const handlerA = handlerEmitting({ data: 'tenant-A-secret' });
    const resA = await run(
      interceptor,
      authedRequest('tenantA', 'alice@a.com', 'REQ-1'),
      handlerA,
    );
    expect(resA).toEqual({ data: 'tenant-A-secret' });

    // Tenant B reuses the very same reqId. It must hit its handler, not A's cache.
    const handlerB = handlerEmitting({ data: 'tenant-B-data' });
    const resB = await run(
      interceptor,
      authedRequest('tenantB', 'bob@b.com', 'REQ-1'),
      handlerB,
    );

    expect(resB).toEqual({ data: 'tenant-B-data' });
    expect(resB).not.toEqual(resA);
    expect(handlerB.calls).toBe(1); // cache miss => handler ran
    // Two distinct, tenant-namespaced keys exist.
    expect([...redis.store.keys()]).toEqual([
      'idempotency:tenantA:alice@a.com:REQ-1',
      'idempotency:tenantB:bob@b.com:REQ-1',
    ]);
  });

  it('does NOT leak across users of the same tenant (defensive sub scoping)', async () => {
    const redis = makeRedis();
    const interceptor = new IdempotencyInterceptor(redis);

    const handlerA = handlerEmitting({ who: 'alice' });
    await run(interceptor, authedRequest('shk', 'alice@shk.com', 'X'), handlerA);

    const handlerB = handlerEmitting({ who: 'bob' });
    const resB = await run(
      interceptor,
      authedRequest('shk', 'bob@shk.com', 'X'),
      handlerB,
    );

    expect(resB).toEqual({ who: 'bob' });
    expect(handlerB.calls).toBe(1);
  });

  it('preserves idempotency: identical tenant+user+reqId returns the cached response', async () => {
    const redis = makeRedis();
    const interceptor = new IdempotencyInterceptor(redis);

    const first = handlerEmitting({ n: 1 });
    const res1 = await run(
      interceptor,
      authedRequest('shk', 'alice@shk.com', 'DUP'),
      first,
    );
    expect(res1).toEqual({ n: 1 });

    // Second identical request: handler emits something different, but the
    // interceptor must return the cached value and never invoke the handler.
    const second = handlerEmitting({ n: 999 });
    const res2 = await run(
      interceptor,
      authedRequest('shk', 'alice@shk.com', 'DUP'),
      second,
    );

    expect(res2).toEqual({ n: 1 });
    expect(second.calls).toBe(0); // cache hit => handler never ran
    expect(redis.set).toHaveBeenCalledTimes(1); // cached exactly once
  });

  it('passes through without caching when there is no clientRequestId', async () => {
    const redis = makeRedis();
    const interceptor = new IdempotencyInterceptor(redis);

    const handler = handlerEmitting({ ok: true });
    const res = await run(
      interceptor,
      authedRequest('shk', 'alice@shk.com'), // no x-request-id, no body
      handler,
    );

    expect(res).toEqual({ ok: true });
    expect(handler.calls).toBe(1);
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.store.size).toBe(0);
  });
});
