import { Injectable, OnApplicationBootstrap, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';

/**
 * Per-tenant conversation discovery index (`conversas:{inst}` SET). Replaces the
 * old global `SCAN chat:{inst}:*:followup_step`, which was both incomplete
 * (conversations without that exact key were invisible) and O(keyspace) across
 * all tenants in the shared Redis.
 */
@Injectable()
export class ConversationIndexService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConversationIndexService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async addJid(instancia: string, jid: string): Promise<void> {
    if (!jid) return;
    await this.redis.sadd(RedisKeys.conversationIndex(instancia), jid);
  }

  async listJids(instancia: string): Promise<string[]> {
    return this.redis.smembers(RedisKeys.conversationIndex(instancia));
  }

  /**
   * One-time backfill: if a tenant's index is empty, rebuild it from existing
   * `chat:{inst}:*:followup_step` keys and `chathistory:{inst}-*` lists. Runs per
   * tenant found in the registry. Idempotent — SADD dedupes.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const raw = await this.redis.get(RedisKeys.tenantRegistry());
      if (!raw) return;
      const registry = JSON.parse(raw);
      const tenants: Array<{ instancia: string }> = registry.tenants ?? [];

      for (const { instancia } of tenants) {
        const indexKey = RedisKeys.conversationIndex(instancia);
        if ((await this.redis.scard(indexKey)) > 0) continue;

        const jids = new Set<string>();
        for (const key of await this.scan(`chat:${instancia}:*:followup_step`)) {
          jids.add(key.split(':')[2]);
        }
        // chathistory:{inst}-{phone} → jid (legacy phones become @s.whatsapp.net)
        for (const key of await this.scan(`chathistory:${instancia}-*`)) {
          const id = key.slice(`chathistory:${instancia}-`.length);
          if (!id) continue;
          jids.add(id.includes('@') ? id : `${id}@s.whatsapp.net`);
        }
        if (jids.size > 0) {
          await this.redis.sadd(indexKey, ...jids);
          this.logger.log(`index-backfill instancia=${instancia} count=${jids.size}`);
        }
      }
    } catch (err) {
      this.logger.warn(`index-backfill failed: ${(err as Error).message}`);
    }
  }

  private async scan(pattern: string): Promise<string[]> {
    const out: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      out.push(...keys);
    } while (cursor !== '0');
    return out;
  }
}
