import { Injectable, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

@Injectable()
export class RedisService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: Redis,
  ) {}

  /** Raw ioredis client for advanced operations */
  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async setpx(key: string, value: string, ttlMs: number): Promise<void> {
    await this.client.set(key, value, 'PX', ttlMs);
  }

  async setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (ttlSeconds) {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    }
    const result = await this.client.setnx(key, value);
    return result === 1;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(key, start, stop);
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.client.lpush(key, ...values);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    return this.client.rpush(key, ...values);
  }

  async xadd(
    stream: string,
    maxlen: number,
    id: string,
    ...fields: string[]
  ): Promise<string | null> {
    return this.client.xadd(
      stream,
      'MAXLEN',
      '~',
      maxlen,
      id,
      ...fields,
    );
  }

  async xrange(
    stream: string,
    start: string,
    end: string,
    count?: number,
  ): Promise<[string, string[]][]> {
    if (count) {
      return this.client.xrange(stream, start, end, 'COUNT', count);
    }
    return this.client.xrange(stream, start, end);
  }

  async scan(pattern: string, count = 100): Promise<string[]> {
    const results: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        count,
      );
      cursor = nextCursor;
      results.push(...keys);
    } while (cursor !== '0');
    return results;
  }

  pipeline() {
    return this.client.pipeline();
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }
}
