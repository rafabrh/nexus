import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { DB } from '../core/db/db.module';
import type { Database } from '../core/db/db.module';
import { messages, MessageRow } from '../core/db/schema';

/**
 * Per-row payload for cold-archive inserts. Covers all user-supplied columns
 * of the `messages` table; `instancia`/`jid` are passed separately (caller
 * scope), `seq` is assigned by bigserial, `createdAt` defaults to now().
 *
 * `raw` (jsonb) is the original JSON object/value from chathistory — required
 * by the schema and included here (YAGNI: no de-normalisation, keep it honest).
 * `quoted` may be null (no quoted message).
 * `ts` may be null (missing timestamp in the original entry).
 * All other media/content fields are optional (undefined → omitted by Drizzle).
 */
export interface ArchiveEntry {
  msgId: string;
  fromMe: boolean;
  type: string | undefined;
  content: string | undefined;
  mediaKind: string | undefined;
  mediaId: string | undefined;
  mediaMimetype: string | undefined;
  quoted: { id: string; preview: string; fromMe: boolean } | null | undefined;
  ts: Date | null;
  raw: unknown;
}

@Injectable()
export class MessageArchiveRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * INSERT ... ON CONFLICT (instancia, jid, msgId) DO NOTHING.
   * Does NOT update ACK — cold history does not track live status (YAGNI).
   */
  async insertManyIdempotent(
    instancia: string,
    jid: string,
    entries: ArchiveEntry[],
  ): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insert(messages)
      .values(entries.map((e) => ({ instancia, jid, ...e })))
      .onConflictDoNothing({ target: [messages.instancia, messages.jid, messages.msgId] });
  }

  /**
   * Cold page by `seq` (stable, non-null). `beforeSeq` paginates backwards.
   * Returns rows in chronological (ascending seq) order.
   */
  async readPage(
    instancia: string,
    jid: string,
    opts: { beforeSeq?: number; limit: number },
  ): Promise<MessageRow[]> {
    const conds = [eq(messages.instancia, instancia), eq(messages.jid, jid)];
    if (opts.beforeSeq != null) conds.push(lt(messages.seq, opts.beforeSeq));
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conds))
      .orderBy(desc(messages.seq))
      .limit(opts.limit);
    return rows.reverse();
  }

  /**
   * Resolves the `seq` of a msgId (hot→cold frontier for pagination).
   * Returns null if the msgId is not in the archive.
   */
  async seqOf(instancia: string, jid: string, msgId: string): Promise<number | null> {
    const [row] = await this.db
      .select({ seq: messages.seq })
      .from(messages)
      .where(and(eq(messages.instancia, instancia), eq(messages.jid, jid), eq(messages.msgId, msgId)))
      .limit(1);
    return row?.seq ?? null;
  }
}
