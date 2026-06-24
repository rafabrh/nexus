import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedisThrottlerStorage } from './redis-throttler.storage';

/**
 * Mocks ioredis. multi() returns a chainable builder whose exec() resolves to
 * the [err, value] tuple array @nestjs/throttler-compatible code expects.
 */
function makeRedis(opts: {
  blockPttl?: number;
  incrValue?: number;
  hitPttl?: number;
  currentHits?: number;
}) {
  const exec = vi.fn(async () => [
    [null, opts.incrValue ?? 1], // incr
    [null, 1], // pexpire NX ack
    [null, opts.hitPttl ?? 60000], // pttl (real TTL — index 2)
  ]);
  const builder: any = {
    incr: vi.fn(() => builder),
    pexpire: vi.fn(() => builder),
    pttl: vi.fn(() => builder),
    exec,
  };
  return {
    pttl: vi.fn(async () => opts.blockPttl ?? -2),
    get: vi.fn(async () => String(opts.currentHits ?? 0)),
    set: vi.fn(async () => 'OK'),
    pexpire: vi.fn(async () => 1),
    multi: vi.fn(() => builder),
    _builder: builder,
    _exec: exec,
  } as any;
}

describe('RedisThrottlerStorage.increment (FIX #2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('increments the counter and arms a NX expiry within the limit', async () => {
    const redis = makeRedis({ incrValue: 3, hitPttl: 55000 });
    const storage = new RedisThrottlerStorage(redis);

    const rec = await storage.increment('shk', 60000, 60, 30000, 'default');

    expect(redis.multi).toHaveBeenCalled();
    expect(redis._builder.incr).toHaveBeenCalledWith('throttle:shk');
    expect(redis._builder.pexpire).toHaveBeenCalledWith(
      'throttle:shk',
      60000,
      'NX',
    );
    expect(rec.totalHits).toBe(3);
    expect(rec.timeToExpire).toBe(55000);
    expect(rec.isBlocked).toBe(false);
    expect(rec.timeToBlockExpire).toBe(0);
  });

  it('signals isBlocked and sets a block marker once the limit is exceeded', async () => {
    const redis = makeRedis({ incrValue: 61, hitPttl: 40000 });
    const storage = new RedisThrottlerStorage(redis);

    const rec = await storage.increment('shk', 60000, 60, 30000, 'default');

    expect(rec.totalHits).toBe(61);
    expect(rec.isBlocked).toBe(true);
    expect(rec.timeToBlockExpire).toBe(30000);
    expect(redis.set).toHaveBeenCalledWith(
      'throttle:shk:block',
      '1',
      'PX',
      30000,
    );
  });

  it('short-circuits while a block is active without counting the hit', async () => {
    const redis = makeRedis({ blockPttl: 12000, currentHits: 99 });
    const storage = new RedisThrottlerStorage(redis);

    const rec = await storage.increment('shk', 60000, 60, 30000, 'default');

    expect(redis.multi).not.toHaveBeenCalled();
    expect(rec.isBlocked).toBe(true);
    expect(rec.totalHits).toBe(99);
    expect(rec.timeToExpire).toBe(12000);
    expect(rec.timeToBlockExpire).toBe(12000);
  });

  it('re-arms the TTL when the counter exists without one (pttl < 0)', async () => {
    const redis = makeRedis({ incrValue: 2, hitPttl: -1 });
    const storage = new RedisThrottlerStorage(redis);

    const rec = await storage.increment('shk', 60000, 60, 30000, 'default');

    expect(redis.pexpire).toHaveBeenCalledWith('throttle:shk', 60000);
    expect(rec.timeToExpire).toBe(60000);
  });
});
