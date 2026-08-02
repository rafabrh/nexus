import { Injectable, Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { MessageArchiveRepository, toArchiveEntries } from './message-archive.repository';

/**
 * One-shot backfill that reads ALL existing `chathistory:*` keys from Redis and
 * writes their contents into the `messages` table (cold archive).
 *
 * Activation: set `BACKFILL_CHATHISTORY=once` in the environment before starting
 * the application. The command runs once during bootstrap then the env guard
 * prevents re-runs in normal operation. Remove (or change) the env var after the
 * backfill is complete so that subsequent restarts are no-ops.
 *
 * Key parsing MIRRORS event.translator.ts:26-32 so that `(instancia, jid)` pairs
 * produced here are IDENTICAL to those produced by the incremental keyspace
 * listener. The PK `(instancia, jid, msgId)` ON CONFLICT DO NOTHING therefore
 * deduplicates cleanly across both paths.
 *
 * NEVER calls LTRIM or eval — archive only. The backfill is designed to precede
 * the incremental archive path so that seq stays chronological.
 *
 * SCAN cursor idiom follows conversation-index.service.ts:60-67 — never KEYS.
 */
@Injectable()
export class ChathistoryBackfillCommand implements OnApplicationBootstrap {
  private readonly logger = new Logger(ChathistoryBackfillCommand.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly archive: MessageArchiveRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Gate: only run when explicitly requested via BACKFILL_CHATHISTORY=once.
    // Any other value (including undefined) is a no-op so normal restarts are safe.
    if (process.env.BACKFILL_CHATHISTORY !== 'once') return;

    this.logger.log('chathistory-backfill: starting…');

    // SCAN (cursor) — never KEYS (blocks Redis in production).
    // Follows the same idiom as conversation-index.service.ts:60-67.
    let cursor = '0';
    let conversations = 0;
    let rows = 0;

    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'chathistory:*', 'COUNT', 100);
      cursor = next;

      for (const key of keys) {
        // Key parsing IDENTICAL to event.translator.ts:26-32.
        // Cross-reference: if the translator changes its parse, update this too.
        const rest = key.slice('chathistory:'.length);
        const dash = rest.indexOf('-'); // FIRST dash only
        if (dash < 0) continue; // skip malformed (no dash)
        const instancia = rest.slice(0, dash);
        const id = rest.slice(dash + 1);
        if (!instancia || !id) continue; // skip if either part is empty

        // Inverse of phoneFromJid: bare numbers become @s.whatsapp.net JIDs;
        // already-qualified JIDs (@lid, @g.us, @s.whatsapp.net) pass through.
        const jid = id.includes('@') ? id : `${id}@s.whatsapp.net`;

        // Read the ENTIRE list (0 to -1), not just the tail.
        // The plan specifies: backfill precedes incremental, so seq is chronological.
        const list = await this.redis.lrange(key, 0, -1);

        const entries = toArchiveEntries(list);
        if (entries.length > 0) {
          await this.archive.insertManyIdempotent(instancia, jid, entries);
          conversations++;
          rows += entries.length;
        }
      }
    } while (cursor !== '0');

    this.logger.log(`chathistory-backfill: ${conversations} conversas, ${rows} mensagens`);
  }
}
