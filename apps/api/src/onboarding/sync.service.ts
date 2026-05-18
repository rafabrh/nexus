import { Injectable, Logger, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { EvolutionClient } from '../whatsapp/evolution.client';

interface SyncResult {
  chats: number;
  messages: number;
  durationMs: number;
}

interface EvolutionChat {
  id?: string;
  remoteJid?: string;
  name?: string;
  [key: string]: unknown;
}

interface EvolutionMessage {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  message?: Record<string, unknown>;
  messageTimestamp?: number | string;
  pushName?: string;
  [key: string]: unknown;
}

const BATCH_SIZE = 10;
const MAX_MESSAGES_PER_CHAT = 200;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly evolution: EvolutionClient,
  ) {}

  async syncAll(instancia: string): Promise<SyncResult> {
    const start = Date.now();
    let totalChats = 0;
    let totalMessages = 0;

    this.logger.log(`sync.started instancia=${instancia}`);

    // 1. Fetch all chats
    const rawChats = await this.evolution.findChats(instancia);
    const chats = Array.isArray(rawChats) ? (rawChats as EvolutionChat[]) : [];

    // Filter to personal chats only (exclude groups, status)
    const personalChats = chats.filter((c) => {
      const jid = c.id || c.remoteJid || '';
      return jid.includes('@s.whatsapp.net');
    });

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
          totalMessages += result.value;
          totalChats++;
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

  private async syncOneChat(instancia: string, chat: EvolutionChat): Promise<number> {
    const jid = chat.id || chat.remoteJid || '';
    if (!jid) return 0;

    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);

    // Check if already synced (idempotent)
    const existingLen = await this.redis.llen(histKey);
    if (existingLen > 0) return 0;

    // Fetch messages from Evolution API
    const rawMessages = await this.evolution.findMessages(instancia, jid, MAX_MESSAGES_PER_CHAT);
    const messages = Array.isArray(rawMessages)
      ? (rawMessages as EvolutionMessage[])
      : ((rawMessages as Record<string, unknown>)?.messages as EvolutionMessage[]) ?? [];

    if (messages.length === 0) return 0;

    // Convert to LangChain format and push to Redis
    const pipeline = this.redis.pipeline();
    let count = 0;

    for (const msg of messages) {
      const content = this.extractContent(msg);
      if (!content) continue;

      const type = msg.key?.fromMe ? 'ai' : 'human';
      const entry = JSON.stringify({
        type,
        data: {
          content,
          timestamp: this.extractTimestamp(msg),
        },
      });

      pipeline.rpush(histKey, entry);
      count++;
    }

    // Set initial conversation state (don't overwrite if webhook already created it)
    const stateKey = RedisKeys.state(instancia, jid);
    const stateExists = await this.redis.exists(stateKey);
    if (!stateExists) {
      pipeline.set(stateKey, 'active');
    }

    const stepKey = RedisKeys.followupStep(instancia, jid);
    const stepExists = await this.redis.exists(stepKey);
    if (!stepExists) {
      pipeline.set(stepKey, 'S0');
    }

    // Save contact name from chat
    if (chat.name) {
      const contactKey = RedisKeys.contact(phone);
      pipeline.set(contactKey, JSON.stringify({ pushName: chat.name }));
    }

    await pipeline.exec();
    return count;
  }

  private async syncContacts(instancia: string): Promise<void> {
    try {
      const rawContacts = await this.evolution.findContacts(instancia);
      const contacts = Array.isArray(rawContacts) ? rawContacts : [];

      const pipeline = this.redis.pipeline();
      for (const c of contacts) {
        const contact = c as Record<string, unknown>;
        const jid = (contact.id as string) || (contact.remoteJid as string) || '';
        const pushName = (contact.pushName as string) || (contact.notify as string) || '';

        if (jid.includes('@s.whatsapp.net') && pushName) {
          const phone = jid.replace('@s.whatsapp.net', '');
          pipeline.set(RedisKeys.contact(phone), JSON.stringify({ pushName }));
        }
      }
      await pipeline.exec();

      this.logger.log(`sync.contacts instancia=${instancia} total=${contacts.length}`);
    } catch (err) {
      this.logger.warn(`sync.contacts-failed instancia=${instancia}: ${(err as Error).message}`);
    }
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
