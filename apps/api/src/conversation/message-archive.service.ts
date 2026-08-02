import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { parseHistoryEntry, phoneFromJid } from './parse-history-entry';
import { MessageArchiveRepository, ArchiveEntry } from './message-archive.repository';

/**
 * Atomic Lua script for safe LTRIM.
 *
 * KEYS[1] = histKey   ARGV[1] = cap (number as string)
 *
 * When llen > cap:
 *   1. Reads the head slice (items to be removed): LRANGE 0 .. (len-cap-1)
 *   2. Trims the list to keep only the tail (cap items): LTRIM (len-cap) -1
 *   3. Returns the removed head — the CALLER archives it before it is gone.
 *
 * When llen <= cap: returns an empty array (no-op).
 *
 * Redis is single-threaded ⇒ no race between the LRANGE, the LTRIM, and a
 * concurrent RPUSH from N8N within this script's execution.
 */
const TRIM_LUA = `
local len = redis.call('LLEN', KEYS[1])
local cap = tonumber(ARGV[1])
if len <= cap then return {} end
local head = redis.call('LRANGE', KEYS[1], 0, len - cap - 1)
redis.call('LTRIM', KEYS[1], len - cap, -1)
return head
`;

@Injectable()
export class MessageArchiveService {
  /** Number of messages to keep hot in Redis (trimmed tail size). */
  private readonly hotCap: number;
  /** Whether to archive the chathistory tail to Postgres (rollout gate). */
  private readonly archiveEnabled: boolean;
  /** Whether to trim the Redis list after archiving the head (rollout gate). */
  private readonly ltrimEnabled: boolean;
  /** Coalescing window: seconds during which a second archive for the same
   *  conversation is suppressed (SET NX EX throttle gate). */
  private readonly throttleSec: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly archive: MessageArchiveRepository,
    private readonly config: ConfigService,
  ) {
    // Number() blinda contra config stub que entregue string: `-( '300' + 50 )`
    // daria NaN no lrange sem erro de tipo. AppConfig já coage, isto é defesa.
    this.hotCap = Number(this.config.get<number>('CHATHISTORY_HOT_CAP') ?? 300);
    this.archiveEnabled = this.config.get<string>('CHATHISTORY_ARCHIVE_ENABLED') === 'true';
    this.ltrimEnabled = this.config.get<string>('CHATHISTORY_LTRIM_ENABLED') === 'true';
    this.throttleSec = Number(this.config.get<number>('CHATHISTORY_ARCHIVE_THROTTLE_SEC') ?? 5);
  }

  /**
   * Archives the chathistory tail for a conversation and optionally trims the
   * Redis list to `hotCap` entries via an atomic Lua script.
   *
   * Two-step protocol (anti-loss guarantee):
   *
   *   Step 1 — Write-behind of the tail (freshness optimisation + cold-start
   *             coverage). Reads the last (hotCap + 50) entries from Redis and
   *             upserts them idempotently into Postgres. The +50 slack means
   *             the most recent data is always persisted before any trim runs.
   *
   *   Step 2 — Atomic LTRIM via Lua (only when ltrimEnabled). The script
   *             returns the exact head slice it removed. The caller archives
   *             those entries BEFORE the script has already trimmed them away,
   *             making the archive the single source of truth for removed data.
   *             Because Redis executes the script atomically (single-threaded),
   *             no concurrent RPUSH can slip between the LRANGE and the LTRIM.
   *
   * Early exit: if archiveEnabled=false the method is a no-op (safe to call
   * at any time; activate via CHATHISTORY_ARCHIVE_ENABLED=true env var).
   *
   * Chamadores externos (ex.: keyspace listener) devem preferir
   * {@link archiveTailCoalesced} para não saturar o pool do Postgres sob alto
   * volume de mensagens. Este método é público para teste isolado do protocolo.
   */
  async archiveTail(instancia: string, jid: string): Promise<void> {
    // Rollout gate — nothing archived until the feature is enabled.
    if (!this.archiveEnabled) return;

    const phone = phoneFromJid(jid);
    const histKey = RedisKeys.chatHistory(instancia, phone);

    // Step 1: Write-behind of the tail.
    // Read the last (hotCap + 50) entries. The +50 is a freshness slack that
    // ensures the warm tail is archived even before any trim run occurs (covers
    // cold-start scenarios and lost keyspace events). The GUARANTEE, however,
    // comes from step 2 — the head returned by the Lua is exactly what was removed.
    const tail = await this.redis.lrange(histKey, -(this.hotCap + 50), -1);
    const tailEntries = this.toEntries(tail);
    if (tailEntries.length > 0) {
      await this.archive.insertManyIdempotent(instancia, jid, tailEntries);
    }

    // Step 2: Atomic LTRIM via Lua (only when ltrimEnabled).
    if (this.ltrimEnabled) {
      const head = (await (this.redis as any).eval(
        TRIM_LUA,
        1,
        histKey,
        String(this.hotCap),
      )) as string[];

      if (head.length > 0) {
        // Archive the removed head BEFORE returning. This is the anti-loss guarantee:
        // the Lua already trimmed these entries from Redis, so this upsert is the
        // only way to ensure they survive.
        const headEntries = this.toEntries(head);
        if (headEntries.length > 0) {
          await this.archive.insertManyIdempotent(instancia, jid, headEntries);
        }
      }
    }
  }

  /**
   * Coalescing por conversa: só roda archiveTail se não houve archive nos
   * últimos throttleSec. O SET NX EX envolve o archiveTail INTEIRO — se throttled,
   * nem archive nem trim rodam (seguro: a Lua sempre arquiva o que apara).
   *
   * Best-effort: se o archive falhar após a marca de throttle ser setada, os
   * retries ficam suprimidos pelo resto da janela; a próxima mensagem fora da
   * janela re-dispara (o protocolo é idempotente via ON CONFLICT DO NOTHING).
   */
  async archiveTailCoalesced(instancia: string, jid: string): Promise<void> {
    if (!this.archiveEnabled) return; // gate barato antes de tocar o Redis
    const key = RedisKeys.archiveThrottle(instancia, jid);
    const acquired = await this.redis.set(key, '1', 'EX', this.throttleSec, 'NX');
    if (acquired == null) return; // outro ciclo recente já arquivou esta conversa
    await this.archiveTail(instancia, jid);
  }

  /**
   * Maps a list of raw JSON strings (chathistory entries) to ArchiveEntry objects.
   *
   * - Malformed entries (parseHistoryEntry returns null) are skipped.
   * - `raw` is set to the ORIGINAL JSON string, not the parsed object, so that
   *   the archive retains full fidelity and `msgId` dedup can rely on it.
   */
  private toEntries(rawList: string[]): ArchiveEntry[] {
    const entries: ArchiveEntry[] = [];
    for (const raw of rawList) {
      const parsed = parseHistoryEntry(raw);
      if (parsed === null) continue;
      entries.push({
        msgId: parsed.msgId,
        fromMe: parsed.fromMe,
        type: parsed.type,
        content: parsed.content,
        mediaKind: parsed.mediaKind,
        mediaId: parsed.mediaId,
        mediaMimetype: parsed.mediaMimetype,
        quoted: parsed.quoted ?? null,
        ts: parsed.ts,
        raw, // original JSON string — preserves full fidelity
      });
    }
    return entries;
  }
}
