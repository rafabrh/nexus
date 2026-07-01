import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import {
  RedisKeys,
  FunnelStage,
  PhoneMask,
} from '@nexus/shared';
import type {
  ConversationListItem,
  ConversationDetail,
  Message,
  AiState,
} from '@nexus/shared';

/** Keywords that indicate a hot lead */
const HOT_KEYWORDS = [
  'comprar', 'quero', 'pagar', 'fechar', 'preco', 'valor',
  'desconto', 'pix', 'cartao', 'boleto', 'contratar', 'assinar',
];

/** Stages S3+ are considered advanced enough to contribute to isHot */
const HOT_STAGES = new Set(['S3', 'S4', 'S5', 'S6']);

@Injectable()
export class ConversationRepository {
  private readonly logger = new Logger(ConversationRepository.name);

  constructor(
    @Inject(REDIS_CLIENT) public readonly redis: Redis,
  ) {}

  /**
   * Scan Redis for all JIDs with a followup_step key for a given tenant.
   */
  async findAllJids(instancia: string): Promise<string[]> {
    const pattern = `chat:${instancia}:*:followup_step`;
    const keys = await this.scanKeys(pattern);
    return keys.map((k) => {
      // key format: chat:{inst}:{jid}:followup_step
      const parts = k.split(':');
      // JID is everything between inst and the last segment
      return parts[2];
    });
  }

  /**
   * Build a ConversationListItem using a Redis pipeline for performance.
   */
  async buildListItem(instancia: string, jid: string): Promise<ConversationListItem> {
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);
    const pipeline = this.redis.pipeline();

    pipeline.get(RedisKeys.followupStep(instancia, jid));        // 0
    pipeline.get(RedisKeys.humanControlUntil(instancia, jid));   // 1
    pipeline.get(RedisKeys.paymentStatus(instancia, jid));       // 2
    pipeline.get(RedisKeys.optout(instancia, jid));              // 3
    pipeline.get(RedisKeys.tags(instancia, jid));                // 4
    pipeline.get(RedisKeys.contact(instancia, phone));           // 5
    pipeline.lrange(histKey, -1, -1);                            // 6 - last message
    pipeline.get(RedisKeys.isHot(instancia, jid));               // 7 - manual isHot flag
    pipeline.lrange(histKey, -10, -1);                           // 8 - last 10 messages for hot detection

    const results = await pipeline.exec();
    const vals = results!.map(([, val]) => val);

    const [stageRaw, humanCtrl, payment, optout, tagsRaw, contactRaw] = vals.slice(0, 6) as (string | null)[];
    const lastMsgArr = vals[6] as string[];
    const manualIsHot = vals[7] as string | null;
    const recentMsgsArr = vals[8] as string[];

    const funnelStage = FunnelStage.fromString(stageRaw);
    const aiState = this.resolveAiState(humanCtrl);
    const tags: string[] = tagsRaw ? this.safeParseArray(tagsRaw) : [];
    const contact = contactRaw ? this.safeParseJson(contactRaw) : {};

    // Extract last message preview and timestamp
    const { preview, timestamp } = this.extractLastMessage(lastMsgArr);

    // Derive lastActivity from the last message timestamp, fallback to now
    const lastActivity = timestamp
      ? new Date(timestamp).toISOString()
      : new Date().toISOString();

    // Determine isHot via multi-criteria or manual override
    const isHot = manualIsHot === 'true' || this.computeIsHot(
      funnelStage.key,
      preview,
      timestamp,
      recentMsgsArr,
    );

    return {
      jid,
      contactName: contact.pushName || contact.name || PhoneMask.mask(jid),
      phoneDisplay: PhoneMask.mask(jid),
      aiState: aiState.state,
      aiOffUntil: aiState.until,
      stage: funnelStage.key,
      stageLabel: funnelStage.label,
      stageColor: funnelStage.color,
      stageProgress: funnelStage.progress,
      paymentStatus: payment,
      optout: optout === 'true',
      tags,
      lastMessagePreview: preview,
      lastActivity,
      isHot,
    };
  }

  /**
   * Build a ConversationDetail including notes and message count.
   */
  async buildDetail(instancia: string, jid: string): Promise<ConversationDetail | null> {
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);
    const pipeline = this.redis.pipeline();

    pipeline.get(RedisKeys.followupStep(instancia, jid));        // 0
    pipeline.get(RedisKeys.humanControlUntil(instancia, jid));   // 1
    pipeline.get(RedisKeys.paymentStatus(instancia, jid));       // 2
    pipeline.get(RedisKeys.optout(instancia, jid));              // 3
    pipeline.get(RedisKeys.tags(instancia, jid));                // 4
    pipeline.get(RedisKeys.contact(instancia, phone));           // 5
    pipeline.get(RedisKeys.notas(instancia, jid));               // 6
    pipeline.llen(histKey);                                      // 7
    pipeline.lrange(histKey, -1, -1);                            // 8 - last message
    pipeline.get(RedisKeys.isHot(instancia, jid));               // 9 - manual isHot
    pipeline.lrange(histKey, -10, -1);                           // 10 - last 10 messages

    const results = await pipeline.exec();
    if (!results) return null;

    const vals = results.map(([, val]) => val);
    const stageRaw = vals[0] as string | null;
    const humanCtrl = vals[1] as string | null;
    const payment = vals[2] as string | null;
    const optout = vals[3] as string | null;
    const tagsRaw = vals[4] as string | null;
    const contactRaw = vals[5] as string | null;
    const notasRaw = vals[6] as string | null;
    const messageCount = vals[7] as number;
    const lastMsgArr = vals[8] as string[];
    const manualIsHot = vals[9] as string | null;
    const recentMsgsArr = vals[10] as string[];

    // If no followup_step exists, conversation does not exist
    if (!stageRaw) return null;

    const funnelStage = FunnelStage.fromString(stageRaw);
    const aiState = this.resolveAiState(humanCtrl);
    const tags: string[] = tagsRaw ? this.safeParseArray(tagsRaw) : [];
    const notes: string[] = notasRaw ? this.safeParseArray(notasRaw) : [];
    const contact = contactRaw ? this.safeParseJson(contactRaw) : {};

    // Extract last message preview and timestamp
    const { preview, timestamp } = this.extractLastMessage(lastMsgArr);

    // Derive lastActivity from the last message timestamp, fallback to now
    const lastActivity = timestamp
      ? new Date(timestamp).toISOString()
      : new Date().toISOString();

    // Determine isHot via multi-criteria or manual override
    const isHot = manualIsHot === 'true' || this.computeIsHot(
      funnelStage.key,
      preview,
      timestamp,
      recentMsgsArr,
    );

    return {
      jid,
      contactName: contact.pushName || contact.name || PhoneMask.mask(jid),
      phoneDisplay: PhoneMask.mask(jid),
      aiState: aiState.state,
      aiOffUntil: aiState.until,
      stage: funnelStage.key,
      stageLabel: funnelStage.label,
      stageColor: funnelStage.color,
      stageProgress: funnelStage.progress,
      paymentStatus: payment,
      optout: optout === 'true',
      tags,
      notes,
      lastMessagePreview: preview,
      lastActivity,
      isHot,
      messageCount: messageCount ?? 0,
    };
  }

  /**
   * Get messages from LangChain Redis chat history.
   */
  async getMessages(instancia: string, jid: string, limit: number): Promise<Message[]> {
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);
    const raw = await this.redis.lrange(histKey, 0, -1);

    const messages: Message[] = [];
    for (let i = 0; i < raw.length; i++) {
      try {
        const parsed = JSON.parse(raw[i]);
        messages.push({
          id: `msg-${i}`,
          role: parsed.type === 'ai' ? 'assistant' : 'user',
          content: parsed.data?.content ?? '',
          mediaType: 'text',
          ts: null,
        });
      } catch {
        // Skip malformed entries
      }
    }

    // Return last N messages if limit is specified
    if (limit > 0 && messages.length > limit) {
      return messages.slice(-limit);
    }
    return messages;
  }

  /**
   * Append a note to the notas JSON array.
   */
  async appendNote(instancia: string, jid: string, text: string): Promise<void> {
    const key = RedisKeys.notas(instancia, jid);
    const existing = await this.redis.get(key);
    const notes: string[] = existing ? this.safeParseArray(existing) : [];
    notes.push(text);
    await this.redis.set(key, JSON.stringify(notes));
  }

  /**
   * Remove a note by index from the notas JSON array.
   */
  async removeNote(instancia: string, jid: string, index: number): Promise<void> {
    const key = RedisKeys.notas(instancia, jid);
    const existing = await this.redis.get(key);
    const notes: string[] = existing ? this.safeParseArray(existing) : [];

    if (index < 0 || index >= notes.length) {
      return;
    }

    notes.splice(index, 1);
    await this.redis.set(key, JSON.stringify(notes));
  }

  /**
   * Add a tag to the tags JSON array (deduped).
   */
  async addTag(instancia: string, jid: string, tag: string): Promise<void> {
    const key = RedisKeys.tags(instancia, jid);
    const existing = await this.redis.get(key);
    const tags: string[] = existing ? this.safeParseArray(existing) : [];

    if (!tags.includes(tag)) {
      tags.push(tag);
      await this.redis.set(key, JSON.stringify(tags));
    }
  }

  /**
   * Remove a tag from the tags JSON array.
   */
  async removeTag(instancia: string, jid: string, tag: string): Promise<void> {
    const key = RedisKeys.tags(instancia, jid);
    const existing = await this.redis.get(key);
    const tags: string[] = existing ? this.safeParseArray(existing) : [];

    const filtered = tags.filter((t) => t !== tag);
    await this.redis.set(key, JSON.stringify(filtered));
  }

  // --- Private helpers ---

  /**
   * Extract the content preview and timestamp from the last chat history entry.
   */
  private extractLastMessage(lastMsgArr: string[]): { preview: string; timestamp: number | null } {
    if (!lastMsgArr || lastMsgArr.length === 0) {
      return { preview: '', timestamp: null };
    }
    try {
      const parsed = JSON.parse(lastMsgArr[0]);
      const content = parsed.data?.content ?? '';
      const ts = parsed.data?.timestamp ?? parsed.timestamp ?? null;
      const preview = content.length > 100 ? content.slice(0, 100) + '...' : content;
      return { preview, timestamp: ts ? Number(ts) : null };
    } catch {
      return { preview: '', timestamp: null };
    }
  }

  /**
   * Multi-criteria isHot detection.
   * A lead is hot if 2+ of the following are true:
   * (a) last message < 5 min ago
   * (b) stage S3+
   * (c) keywords in last message content
   * (d) 3+ messages in last 10 min (approximated from recent messages)
   */
  private computeIsHot(
    stage: string,
    lastMessageContent: string,
    lastMessageTs: number | null,
    recentMsgsArr: string[],
  ): boolean {
    let score = 0;
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;
    const tenMin = 10 * 60 * 1000;

    // (a) last message < 5 min
    if (lastMessageTs && (now - lastMessageTs) < fiveMin) {
      score++;
    }

    // (b) stage S3+
    if (HOT_STAGES.has(stage)) {
      score++;
    }

    // (c) keywords in content
    if (lastMessageContent) {
      const lower = lastMessageContent.toLowerCase();
      if (HOT_KEYWORDS.some((kw) => lower.includes(kw))) {
        score++;
      }
    }

    // (d) 3+ messages in last 10 min
    if (recentMsgsArr && recentMsgsArr.length >= 3) {
      let recentCount = 0;
      for (const raw of recentMsgsArr) {
        try {
          const parsed = JSON.parse(raw);
          const ts = parsed.data?.timestamp ?? parsed.timestamp;
          if (ts && (now - Number(ts)) < tenMin) {
            recentCount++;
          }
        } catch {
          // skip
        }
      }
      if (recentCount >= 3) {
        score++;
      }
    }

    return score >= 2;
  }

  private resolveAiState(humanControlUntil: string | null): { state: AiState; until: string | null } {
    if (!humanControlUntil) {
      return { state: 'ON', until: null };
    }
    const until = parseInt(humanControlUntil, 10);
    if (isNaN(until) || until <= Date.now()) {
      return { state: 'ON', until: null };
    }
    return { state: 'OFF_UNTIL', until: new Date(until).toISOString() };
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const results: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      results.push(...keys);
    } while (cursor !== '0');
    return results;
  }

  private safeParseArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private safeParseJson(value: string): Record<string, string> {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
}
