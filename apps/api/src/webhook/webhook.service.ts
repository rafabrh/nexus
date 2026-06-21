import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { EventPublisher } from '../realtime/event.publisher';
import { resolvePersonalJid } from '../core/whatsapp/jid.util';
import { ConversationIndexService } from '../conversation/conversation-index.service';
import { TenantRepository } from '../admin/tenant.repository';

/** Keywords that indicate a hot lead */
const HOT_KEYWORDS = [
  'comprar', 'quero', 'pagar', 'fechar', 'preco', 'valor',
  'desconto', 'pix', 'cartao', 'boleto', 'contratar', 'assinar',
];

/** Stages S3+ are considered advanced enough to contribute to isHot */
const HOT_STAGES = new Set(['S3', 'S4', 'S5', 'S6']);

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly publisher: EventPublisher,
    private readonly index: ConversationIndexService,
    private readonly tenants: TenantRepository,
  ) {}

  async processEvolutionEvent(payload: Record<string, unknown>): Promise<void> {
    const event = payload.event as string | undefined;
    const instanceName = payload.instance as string | undefined;

    if (!event || !instanceName) {
      this.logger.debug('webhook.ignored: missing event or instance');
      return;
    }

    switch (event) {
      case 'messages.upsert':
        await this.handleMessageUpsert(instanceName, payload);
        break;
      case 'connection.update':
        await this.handleConnectionUpdate(instanceName, payload);
        break;
      case 'contacts.update':
      case 'contacts.upsert':
        await this.handleContactUpdate(instanceName, payload);
        break;
      default:
        this.logger.debug(`webhook.unhandled event=${event} instance=${instanceName}`);
    }
  }

  private async handleMessageUpsert(
    instanceName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const dataObj = payload.data;
      if (Array.isArray(dataObj)) {
        for (const item of dataObj) {
          if (item && typeof item === 'object') {
            await this.processOneMessage(instanceName, item as Record<string, unknown>);
          }
        }
      } else if (dataObj && typeof dataObj === 'object') {
        await this.processOneMessage(instanceName, dataObj as Record<string, unknown>);
      }
    } catch (err) {
      this.logger.error(`webhook.message-error instance=${instanceName}: ${(err as Error).message}`);
    }
  }

  private async processOneMessage(
    instanceName: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const key = data.key as Record<string, unknown> | undefined;
    if (!key) return;

    // Resolve canonical phone/JID, handling both legacy @s.whatsapp.net and
    // @lid addressing (real phone in key.remoteJidAlt). Skip groups/broadcasts.
    const resolved = resolvePersonalJid(
      key.remoteJid as string | undefined,
      key.remoteJidAlt as string | undefined,
    );
    if (!resolved) return;
    const { phone, jid } = resolved;

    const fromMe = key.fromMe === true;

    // Extract message content
    const content = this.extractContent(data);
    const mediaType = typeof data.messageType === 'string' ? data.messageType : 'text';
    if (!content) return;

    // Persist message to chathistory:{instance}-{phone} (aligned with N8N)
    const histKey = RedisKeys.chatHistory(instanceName, phone);
    const type = fromMe ? 'ai' : 'human';
    const entry = JSON.stringify({ type, data: { content } });
    await this.redis.rpush(histKey, entry);

    // Register the conversation in the per-tenant discovery index.
    await this.index.addJid(instanceName, jid);

    // Ensure conversation state exists
    const stateKey = RedisKeys.state(instanceName, jid);
    const stateExists = await this.redis.exists(stateKey);
    if (!stateExists) {
      await this.redis.set(stateKey, 'active');
    }

    const stepKey = RedisKeys.followupStep(instanceName, jid);
    const stepExists = await this.redis.exists(stepKey);
    if (!stepExists) {
      await this.redis.set(stepKey, 'S0');
    }

    // Update contact name if available
    const pushName = typeof data.pushName === 'string' ? data.pushName : null;
    if (pushName) {
      const contactKey = RedisKeys.contact(phone);
      await this.redis.set(contactKey, JSON.stringify({ pushName }));
    }

    // Detect lead.hot automatically
    if (!fromMe) {
      try {
        await this.detectAndEmitHot(instanceName, jid, content);
      } catch (err: unknown) {
        this.logger.warn(`lead.hot detection failed: ${(err as Error).message}`);
      }
    }

    // Invalidate caches for this tenant
    await this.redis.del(RedisKeys.cacheConversations(instanceName));
    await this.redis.del(RedisKeys.cacheDashboard(instanceName));

    this.logger.log(
      `webhook.message-processed instance=${instanceName} jid=${jid} fromMe=${fromMe} type=${mediaType}`,
    );
  }

  private extractContent(data: Record<string, unknown>): string | null {
    const messageObj = data.message;
    if (!messageObj || typeof messageObj !== 'object') return null;
    const message = messageObj as Record<string, unknown>;

    // conversation (simple text)
    if (typeof message.conversation === 'string') return message.conversation;

    // extendedTextMessage
    const ext = message.extendedTextMessage as Record<string, unknown> | undefined;
    if (ext && typeof ext.text === 'string') return ext.text;

    // imageMessage
    const img = message.imageMessage as Record<string, unknown> | undefined;
    if (img) return typeof img.caption === 'string' ? img.caption : '[imagem]';

    // videoMessage
    const vid = message.videoMessage as Record<string, unknown> | undefined;
    if (vid) return typeof vid.caption === 'string' ? vid.caption : '[video]';

    // audioMessage
    if (message.audioMessage) return '[audio]';

    // documentMessage
    const doc = message.documentMessage as Record<string, unknown> | undefined;
    if (doc) return typeof doc.fileName === 'string' ? `[doc: ${doc.fileName}]` : '[documento]';

    // stickerMessage
    if (message.stickerMessage) return '[sticker]';

    // locationMessage
    if (message.locationMessage) return '[localizacao]';

    // contactMessage
    if (message.contactMessage) return '[contato]';

    // reactionMessage - skip
    if (message.reactionMessage) return null;

    // protocolMessage - skip
    if (message.protocolMessage) return null;

    return '[mensagem]';
  }

  /**
   * Detect if a lead is hot based on multi-criteria and emit lead.hot event.
   */
  private async detectAndEmitHot(
    instanceName: string,
    jid: string,
    content: string,
  ): Promise<void> {
    let score = 0;
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;
    const tenMin = 10 * 60 * 1000;

    // (a) last message is right now (< 5 min) — always true for incoming message
    score++;

    // (b) stage S3+
    const stepKey = RedisKeys.followupStep(instanceName, jid);
    const stage = await this.redis.get(stepKey);
    if (stage && HOT_STAGES.has(stage)) {
      score++;
    }

    // (c) keywords in content
    if (content) {
      const lower = content.toLowerCase();
      if (HOT_KEYWORDS.some((kw) => lower.includes(kw))) {
        score++;
      }
    }

    // (d) 3+ messages in last 10 min — check recent history timestamps
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instanceName, phone);
    const recentMsgs = await this.redis.lrange(histKey, -10, -1);
    if (recentMsgs.length >= 3) {
      let recentCount = 0;
      for (const raw of recentMsgs) {
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

    if (score >= 2) {
      await this.publisher.publish({
        type: 'lead.hot',
        instancia: instanceName,
        jid,
        ts: now,
        payload: { score, automatic: true },
      });
      this.logger.log(`lead.hot detected for ${instanceName}/${jid} (score=${score})`);
    }
  }

  private async handleConnectionUpdate(
    instanceName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const dataObj = payload.data;
    if (!dataObj || typeof dataObj !== 'object') return;

    const data = dataObj as Record<string, unknown>;

    // Resolve state from various Evolution API formats
    let state = 'unknown';
    const instanceObj = data.instance as Record<string, unknown> | undefined;
    if (instanceObj && typeof instanceObj.state === 'string') {
      state = instanceObj.state;
    } else if (typeof data.state === 'string') {
      state = data.state;
    }

    const mappedState = state === 'open' ? 'open' : state === 'connecting' ? 'connecting' : 'close';

    // Persist to Redis
    await this.redis.set(RedisKeys.instanceState(instanceName), mappedState);

    // Update tenant registry
    await this.updateTenantConnectionState(instanceName, mappedState);

    this.logger.log(`onboarding.connection-${mappedState} instance=${instanceName}`);
  }

  private async handleContactUpdate(
    instanceName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const dataObj = payload.data;
    if (!Array.isArray(dataObj)) return;

    for (const item of dataObj) {
      if (!item || typeof item !== 'object') continue;
      const contact = item as Record<string, unknown>;

      const resolved = resolvePersonalJid(
        contact.remoteJid as string | undefined,
        contact.remoteJidAlt as string | undefined,
      );
      const pushName = typeof contact.pushName === 'string' ? contact.pushName : null;

      if (resolved && pushName) {
        await this.redis.set(
          RedisKeys.contact(resolved.phone),
          JSON.stringify({ pushName }),
        );
      }
    }

    // Invalidate caches
    await this.redis.del(RedisKeys.cacheContacts(instanceName));
    await this.redis.del(RedisKeys.cacheConversations(instanceName));
  }

  private async updateTenantConnectionState(instanceName: string, connectionState: string): Promise<void> {
    try {
      // UPDATE por linha no Postgres — sem RMW de blob, sem lost-update contra
      // um registerTenant/onboarding concorrente.
      await this.tenants.updateState(instanceName, { connectionState });
    } catch {
      this.logger.warn('Failed to update tenant connection state from webhook');
    }
  }
}
