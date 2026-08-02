import { createHash } from 'crypto';

/**
 * A parsed representation of a single raw chathistory entry from Redis.
 * Fields mirror the parse logic in ConversationRepository.getMessages.
 */
export interface ParsedHistoryEntry {
  /** WAMID, media.id, or a deterministic legacy- prefix + sha1 for id-less entries. */
  msgId: string;
  /** True when parsed.type === 'ai' (outgoing / assistant message). */
  fromMe: boolean;
  /** The raw `type` field from the entry ('ai', 'human', etc.). */
  type: string | undefined;
  /** Text content from data.content, empty string when absent. */
  content: string;
  /** Media kind (image, audio, video, document) — undefined for non-media messages. */
  mediaKind: string | undefined;
  /** Media id from media.id — undefined when there is no media. */
  mediaId: string | undefined;
  /** Media mimetype from media.mimetype — undefined when not present. */
  mediaMimetype: string | undefined;
  /** Quoted message metadata, undefined if absent or malformed. */
  quoted: { id: string; preview: string; fromMe: boolean } | undefined;
  /** Timestamp as a Date instance (from data.timestamp epoch ms), null if absent. */
  ts: Date | null;
}

/**
 * Strips the `@s.whatsapp.net` suffix added upstream (event.translator.ts) to
 * recover the canonical identifier. @lid and @g.us JIDs pass through unchanged.
 */
export function phoneFromJid(jid: string): string {
  return jid.replace('@s.whatsapp.net', '');
}

/** Resultado do parse de uma chave `chathistory:{inst}-{id}`. */
export interface ParsedHistoryKey {
  instancia: string;
  id: string;
  jid: string;
}

/**
 * FONTE ÚNICA do parse da chave `chathistory:{inst}-{id}` → `(instancia, id, jid)`.
 * Usado pelo event.translator (caminho incremental), pelo conversation-index e
 * pelo backfill — os três DEVEM produzir os mesmos `(instancia, jid)`, senão o
 * dedup por PK `(instancia, jid, msgId)` quebra entre backfill e incremental.
 *
 * Split no PRIMEIRO '-' (nomes de instância não contêm '-' neste codebase). O
 * `jid` é o inverso de `phoneFromJid`: id sem '@' vira `@s.whatsapp.net`;
 * @lid/@g.us/@s.whatsapp.net passam inalterados. Retorna null para chave malformada.
 */
export function parseHistoryKey(key: string): ParsedHistoryKey | null {
  if (!key.startsWith('chathistory:')) return null;
  const rest = key.slice('chathistory:'.length);
  const dash = rest.indexOf('-');
  if (dash < 0) return null;
  const instancia = rest.slice(0, dash);
  const id = rest.slice(dash + 1);
  if (!instancia || !id) return null;
  const jid = id.includes('@') ? id : `${id}@s.whatsapp.net`;
  return { instancia, id, jid };
}

/**
 * Parse a single raw chathistory JSON string into a ParsedHistoryEntry.
 *
 * Returns null for malformed (non-parseable) entries so the caller can skip them,
 * exactly as the try/catch in getMessages does.
 *
 * NOTE: dedup by WAMID (seenIds) is the caller's responsibility — this function
 * processes ONE entry in isolation and has no knowledge of surrounding entries.
 */
export function parseHistoryEntry(raw: string): ParsedHistoryEntry | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const media = parsed.media as
    | { kind?: string; id?: string; mimetype?: string | null; fromMe?: boolean }
    | undefined;

  // Determine the real WAMID: top-level id wins, then media.id, then legacy fallback.
  const realId =
    (typeof parsed.id === 'string' && parsed.id) || media?.id || null;
  const msgId = realId ?? `legacy-${createHash('sha1').update(raw).digest('hex')}`;

  // Timestamp
  const data = parsed.data as { content?: unknown; timestamp?: unknown } | undefined;
  const ts =
    typeof data?.timestamp === 'number'
      ? new Date(data.timestamp)
      : null;

  // Outgoing if type === 'ai'
  const type = typeof parsed.type === 'string' ? parsed.type : undefined;
  const fromMe = type === 'ai';

  // Content
  const content = typeof data?.content === 'string' ? data.content : '';

  // Media fields
  const mediaKind = media?.kind;
  const mediaId = media?.id;
  const mediaMimetype =
    typeof media?.mimetype === 'string' ? media.mimetype : undefined;

  // Quoted message
  const rawQuoted = parsed.quoted;
  const quoted =
    rawQuoted && typeof rawQuoted === 'object'
      ? (() => {
          const q = rawQuoted as Record<string, unknown>;
          return {
            id: String(q.id ?? ''),
            preview: String(q.preview ?? ''),
            fromMe: q.fromMe === true,
          };
        })()
      : undefined;

  return {
    msgId,
    fromMe,
    type,
    content,
    mediaKind,
    mediaId,
    mediaMimetype,
    quoted,
    ts,
  };
}
