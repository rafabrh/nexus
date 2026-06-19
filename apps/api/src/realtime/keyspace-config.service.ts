import { Injectable, OnApplicationBootstrap, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';

/**
 * Ensures Redis emits keyspace notifications, which the entire passive realtime
 * layer depends on. Runs `CONFIG SET notify-keyspace-events KEA` on boot and
 * validates it stuck. A managed Redis that blocks CONFIG will fail here — we log
 * an error and mark realtime degraded (the poll safety net keeps the panel
 * eventually consistent), but never crash the app.
 */
@Injectable()
export class KeyspaceConfigService implements OnApplicationBootstrap {
  private readonly logger = new Logger(KeyspaceConfigService.name);
  private ready = false;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  isReady(): boolean {
    return this.ready;
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.redis.config('SET', 'notify-keyspace-events', 'KEA');
      const result = (await this.redis.config('GET', 'notify-keyspace-events')) as string[];
      const value = result?.[1] ?? '';
      // Need keyspace events (K) plus generic/string/list classes (covered by A).
      this.ready = value.includes('K') && (value.includes('A') || value.includes('g'));
      if (this.ready) {
        this.logger.log(`Keyspace notifications enabled (notify-keyspace-events=${value})`);
      } else {
        this.logger.error(`Keyspace notifications NOT active (got '${value}') — realtime degraded`);
      }
    } catch (err) {
      this.ready = false;
      this.logger.error(
        `Could not configure notify-keyspace-events — realtime degraded: ${(err as Error).message}`,
      );
    }
  }
}
