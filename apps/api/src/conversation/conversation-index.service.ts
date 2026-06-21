import { Injectable, Inject, Logger } from '@nestjs/common';
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
export class ConversationIndexService {
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
   * One-time backfill for a single tenant: if its index is empty, rebuild it
   * from existing `chat:{inst}:*:followup_step` keys and `chathistory:{inst}-*`
   * lists. Idempotent — the scard guard makes a populated index a no-op and SADD
   * dedupes.
   *
   * Driven on boot by {@link ConversationProjectionService} so the Redis index is
   * always built BEFORE the Postgres projection sources from it. This makes the
   * backfill independent of module bootstrap ordering — the previous design,
   * where index and projection each had their own OnApplicationBootstrap, left
   * the projection empty after a cutover whenever it bootstrapped first.
   */
  async backfillIfEmpty(instancia: string): Promise<void> {
    const indexKey = RedisKeys.conversationIndex(instancia);
    if ((await this.redis.scard(indexKey)) > 0) return;

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
