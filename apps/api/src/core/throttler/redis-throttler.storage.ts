import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

/**
 * Mirrors @nestjs/throttler's ThrottlerStorageRecord. The interface is not
 * re-exported from the package root in v6, so we declare the shape locally to
 * keep the return type explicit without a fragile deep-subpath import.
 */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Redis-backed throttler storage so rate-limit counters are shared across every
 * API replica (in-memory storage would let N replicas each grant the full quota).
 *
 * Two namespaces per tracker key:
 *  - `throttle:{key}`        -> the hit counter (TTL = window ttl)
 *  - `throttle:{key}:block`  -> a block marker (TTL = blockDuration) set once the
 *                               limit is exceeded, so a flood stays blocked for the
 *                               full blockDuration instead of recovering each window.
 *
 * TTLs from @nestjs/throttler are already in milliseconds (PEXPIRE / PTTL).
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `throttle:${key}`;
    const blockKey = `throttle:${key}:block`;

    // Already blocked? Don't count the hit; just report the remaining block.
    const blockPttl = await this.redis.pttl(blockKey);
    if (blockPttl > 0) {
      const hits = Number((await this.redis.get(hitKey)) ?? limit + 1);
      return {
        totalHits: hits,
        timeToExpire: blockPttl,
        isBlocked: true,
        timeToBlockExpire: blockPttl,
      };
    }

    // Atomic incr + read pttl. EXPIRE is applied only when the counter is fresh
    // (NX) so the window slides correctly and we don't extend it on every hit.
    // NOTE: the pipeline runs incr, pexpire, pttl -> results[0], [1], [2].
    // pttl is the THIRD command, so its result is at index 2 (index 1 is the
    // pexpire ack, not the TTL).
    const results = (await this.redis
      .multi()
      .incr(hitKey)
      .pexpire(hitKey, ttl, 'NX')
      .pttl(hitKey)
      .exec()) as [Error | null, unknown][];
    const incrRes = results?.[0];
    const pttlRes = results?.[2];

    const totalHits = Number(incrRes?.[1] ?? 0);
    let timeToExpire = Number(pttlRes?.[1] ?? ttl);
    if (timeToExpire < 0) {
      // Key existed without a TTL (shouldn't happen) — re-arm it.
      await this.redis.pexpire(hitKey, ttl);
      timeToExpire = ttl;
    }

    let isBlocked = false;
    let timeToBlockExpire = 0;

    if (totalHits > limit) {
      isBlocked = true;
      timeToBlockExpire = blockDuration;
      await this.redis.set(blockKey, '1', 'PX', blockDuration);
    }

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
  }
}
