import { Injectable, Logger, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { EvolutionClient } from '../whatsapp/evolution.client';
import { resolvePersonalJid } from '../core/whatsapp/jid.util';
import { ConversationIndexService } from '../conversation/conversation-index.service';

interface SyncResult {
  chats: number;
  messages: number;
  durationMs: number;
}

interface EvolutionMessageKey {
  remoteJid?: string;
  remoteJidAlt?: string;
  fromMe?: boolean;
  id?: string;
}

interface EvolutionMessage {
  key?: EvolutionMessageKey;
  message?: Record<string, unknown>;
  messageTimestamp?: number | string;
  pushName?: string;
  [key: string]: unknown;
}

interface EvolutionChat {
  id?: string;
  remoteJid?: string;
  name?: string;
  pushName?: string;
  lastMessage?: EvolutionMessage;
  [key: string]: unknown;
}

const BATCH_SIZE = 10;
const MAX_MESSAGES_PER_CHAT = 200;

// Baileys populates the chat history asynchronously AFTER the connection opens.
// The onboarding sync fires the moment we detect `open`, so the first
// `findChats` often returns an empty/partial list while WhatsApp is still
// downloading. We poll until the personal-chat count stops growing (stable)
// or we exhaust the attempts — the latter also covers a legitimately empty
// account. Total worst case ≈ POLL_ATTEMPTS * POLL_INTERVAL_MS.
const CHAT_POLL_ATTEMPTS = 6;
const CHAT_POLL_INTERVAL_MS = 5000;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly evolution: EvolutionClient,
    private readonly index: ConversationIndexService,
  ) {}

  async syncAll(instancia: string): Promise<SyncResult> {
    const start = Date.now();
    let totalChats = 0;
    let totalMessages = 0;

    this.logger.log(`sync.started instancia=${instancia}`);

    // 1. Fetch all chats, polling until WhatsApp finishes downloading history.
    const personalChats = await this.collectStableChats(instancia);

    this.logger.log(
      `sync.progress instancia=${instancia} phase=chats total=${personalChats.length}`,
    );

    // 2. Process chats in batches
    for (let i = 0; i < personalChats.length; i += BATCH_SIZE) {
      const batch = personalChats.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((chat) => this.syncOneChat(instancia, chat)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value > 0) {
            totalMessages += result.value;
            totalChats++;
          }
        } else {
          this.logger.warn(`sync.chat-failed: ${result.reason}`);
        }
      }

      this.logger.debug(
        `sync.progress instancia=${instancia} phase=messages processed=${Math.min(i + BATCH_SIZE, personalChats.length)}/${personalChats.length}`,
      );
    }

    // 3. Sync contacts
    await this.syncContacts(instancia);

    const durationMs = Date.now() - start;
    return { chats: totalChats, messages: totalMessages, durationMs };
  }

  /**
   * Polls `findChats` until the individual-chat count stabilizes (two
   * consecutive non-growing reads) or the attempts run out. This absorbs the
   * race where the onboarding sync fires before Baileys finished syncing the
   * chat history — the original bug where new instances imported 0 chats.
   *
   * An account with genuinely no conversations simply exhausts the attempts
   * and returns an empty list. `intervalMs` is a parameter so tests can drive
   * the loop without real delays.
   */
  async collectStableChats(
    instancia: string,
    attempts = CHAT_POLL_ATTEMPTS,
    intervalMs = CHAT_POLL_INTERVAL_MS,
  ): Promise<EvolutionChat[]> {
    let previousCount = -1;
    let chats: EvolutionChat[] = [];

    for (let attempt = 0; attempt < attempts; attempt++) {
      chats = this.filterPersonalChats(await this.evolution.findChats(instancia));

      // Stable once we have chats and the count didn't grow since the last poll.
      if (chats.length > 0 && chats.length === previousCount) {
        this.logger.debug(
          `sync.chats-stable instancia=${instancia} count=${chats.length} attempts=${attempt + 1}`,
        );
        return chats;
      }

      previousCount = chats.length;
      if (attempt < attempts - 1) await this.delay(intervalMs);
    }

    this.logger.debug(
      `sync.chats-timeout instancia=${instancia} count=${chats.length} attempts=${attempts}`,
    );
    return chats;
  }

  /**
   * Keeps individual conversations only — both legacy @s.whatsapp.net and the
   * newer @lid addressing. Groups (@g.us) and broadcasts are excluded; the
   * phone is resolved per-chat from the message alt fields.
   */
  private filterPersonalChats(rawChats: unknown): EvolutionChat[] {
    const chats = Array.isArray(rawChats) ? (rawChats as EvolutionChat[]) : [];
    return chats.filter((c) => {
      const jid = this.chatQueryJid(c);
      return jid.length > 0 && !jid.endsWith('@g.us') && !jid.endsWith('@broadcast');
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * The identifier used to query messages from Evolution. v2 puts the real JID
   * in `remoteJid` (may be `@lid`); older payloads put it in `id`.
   */
  private chatQueryJid(chat: EvolutionChat): string {
    if (typeof chat.remoteJid === 'string' && chat.remoteJid.includes('@')) {
      return chat.remoteJid;
    }
    if (typeof chat.id === 'string' && chat.id.includes('@')) {
      return chat.id;
    }
    return '';
  }

  private async syncOneChat(instancia: string, chat: EvolutionChat): Promise<number> {
    const queryJid = this.chatQueryJid(chat);
    if (!queryJid) return 0;

    // Fetch messages first — the @lid query works, and the real phone lives in
    // each message's `key.remoteJidAlt`.
    const rawMessages = await this.evolution.findMessages(
      instancia,
      queryJid,
      MAX_MESSAGES_PER_CHAT,
    );
    const messages = this.parseMessages(rawMessages);
    if (messages.length === 0) return 0;

    // Resolve the canonical phone/JID (aligned with N8N): prefer the chat's
    // lastMessage alt, then any message alt, then the chat JID itself (legacy).
    const altFromChat = chat.lastMessage?.key?.remoteJidAlt;
    const altFromMessages = messages
      .map((m) => m.key?.remoteJidAlt)
      .find((a): a is string => typeof a === 'string');
    const resolved = resolvePersonalJid(queryJid, altFromChat, altFromMessages);
    if (!resolved) {
      // Unresolvable LID (no real phone available) — skip rather than store
      // under a key the N8N flow will never touch.
      this.logger.debug(`sync.chat-skipped instancia=${instancia} jid=${queryJid} reason=unresolvable-lid`);
      return 0;
    }
    const { phone, jid } = resolved;

    const histKey = RedisKeys.chatHistory(instancia, phone);

    // Idempotent: skip if this conversation was already imported.
    const existingLen = await this.redis.llen(histKey);
    if (existingLen > 0) return 0;

    // Store oldest-first (LangChain order). Evolution does not guarantee order.
    const ordered = [...messages].sort(
      (a, b) => this.extractTimestamp(a) - this.extractTimestamp(b),
    );

    const pipeline = this.redis.pipeline();
    let count = 0;
    for (const msg of ordered) {
      const content = this.extractContent(msg);
      if (!content) continue;

      const type = msg.key?.fromMe ? 'ai' : 'human';
      pipeline.rpush(
        histKey,
        JSON.stringify({
          type,
          data: { content, timestamp: this.extractTimestamp(msg) },
        }),
      );
      count++;
    }

    if (count === 0) return 0;

    // Initial conversation state — don't overwrite if the webhook beat us to it.
    const stateKey = RedisKeys.state(instancia, jid);
    if (!(await this.redis.exists(stateKey))) {
      pipeline.set(stateKey, 'active');
    }

    const stepKey = RedisKeys.followupStep(instancia, jid);
    if (!(await this.redis.exists(stepKey))) {
      pipeline.set(stepKey, 'S0');
    }

    const contactName = chat.pushName || chat.name;
    if (contactName) {
      pipeline.set(RedisKeys.contact(phone), JSON.stringify({ pushName: contactName }));
    }

    await pipeline.exec();

    // Register the conversation in the per-tenant discovery index so it shows
    // up in the panel list without a global SCAN.
    await this.index.addJid(instancia, jid);

    return count;
  }

  private async syncContacts(instancia: string): Promise<void> {
    try {
      const rawContacts = await this.evolution.findContacts(instancia);
      const contacts = Array.isArray(rawContacts) ? rawContacts : [];

      const pipeline = this.redis.pipeline();
      let saved = 0;
      for (const c of contacts) {
        const contact = c as Record<string, unknown>;
        const resolved = resolvePersonalJid(
          contact.remoteJid as string | undefined,
          contact.remoteJidAlt as string | undefined,
          contact.id as string | undefined,
        );
        const pushName =
          (contact.pushName as string) || (contact.notify as string) || '';

        if (resolved && pushName) {
          pipeline.set(
            RedisKeys.contact(resolved.phone),
            JSON.stringify({ pushName }),
          );
          saved++;
        }
      }
      await pipeline.exec();

      this.logger.log(
        `sync.contacts instancia=${instancia} total=${contacts.length} saved=${saved}`,
      );
    } catch (err) {
      this.logger.warn(
        `sync.contacts-failed instancia=${instancia}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Normalizes the Evolution findMessages response. v2 returns
   * `{ messages: { records: [...] } }`; older shapes return `{ messages: [...] }`
   * or a bare array.
   */
  private parseMessages(raw: unknown): EvolutionMessage[] {
    if (Array.isArray(raw)) return raw as EvolutionMessage[];
    const obj = raw as Record<string, unknown> | null;
    const messages = obj?.messages;
    if (Array.isArray(messages)) return messages as EvolutionMessage[];
    const records = (messages as Record<string, unknown> | undefined)?.records;
    if (Array.isArray(records)) return records as EvolutionMessage[];
    return [];
  }

  private extractContent(msg: EvolutionMessage): string | null {
    const message = msg.message;
    if (!message || typeof message !== 'object') return null;

    if (typeof message.conversation === 'string') return message.conversation;

    const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
    if (ext && typeof ext.text === 'string') return ext.text;

    const img = message.imageMessage as Record<string, unknown> | undefined;
    if (img) return typeof img.caption === 'string' ? img.caption : '[imagem]';

    const vid = message.videoMessage as Record<string, unknown> | undefined;
    if (vid) return typeof vid.caption === 'string' ? vid.caption : '[video]';

    if (message.audioMessage) return '[audio]';

    const doc = message.documentMessage as Record<string, unknown> | undefined;
    if (doc) return typeof doc.fileName === 'string' ? `[doc: ${doc.fileName}]` : '[documento]';

    if (message.stickerMessage) return '[sticker]';
    if (message.locationMessage) return '[localizacao]';
    if (message.contactMessage) return '[contato]';
    if (message.reactionMessage) return null;
    if (message.protocolMessage) return null;

    return '[mensagem]';
  }

  private extractTimestamp(msg: EvolutionMessage): number {
    const ts = msg.messageTimestamp;
    if (!ts) return Date.now();
    const num = typeof ts === 'string' ? parseInt(ts, 10) : ts;
    // Evolution returns seconds, we store ms
    return num < 1e12 ? num * 1000 : num;
  }
}
