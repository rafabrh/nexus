import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
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
        this.handleConnectionUpdate(instanceName, payload);
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

    const jid = key.remoteJid as string | undefined;
    if (!jid || !jid.includes('@s.whatsapp.net')) return;

    const fromMe = key.fromMe === true;
    const phone = jid.replace('@s.whatsapp.net', '');

    // Extract message content
    const content = this.extractContent(data);
    const mediaType = typeof data.messageType === 'string' ? data.messageType : 'text';
    if (!content) return;

    // Persist message to chathistory:{instance}-{phone}
    const histKey = `chathistory:${instanceName}-${phone}`;
    const type = fromMe ? 'ai' : 'human';
    const entry = JSON.stringify({ type, data: { content } });
    await this.redis.rpush(histKey, entry);

    // Ensure conversation state exists
    const stateKey = `chat:${instanceName}:${jid}:state`;
    const stateExists = await this.redis.exists(stateKey);
    if (!stateExists) {
      await this.redis.set(stateKey, 'active');
    }

    const stepKey = `chat:${instanceName}:${jid}:followup_step`;
    const stepExists = await this.redis.exists(stepKey);
    if (!stepExists) {
      await this.redis.set(stepKey, 'S0');
    }

    // Update contact name if available
    const pushName = typeof data.pushName === 'string' ? data.pushName : null;
    if (pushName) {
      const contactKey = `contact:${phone}`;
      await this.redis.set(contactKey, JSON.stringify({ pushName }));
    }

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

  private handleConnectionUpdate(
    instanceName: string,
    payload: Record<string, unknown>,
  ): void {
    const dataObj = payload.data;
    if (dataObj && typeof dataObj === 'object') {
      const data = dataObj as Record<string, unknown>;
      const state = typeof data.state === 'string' ? data.state : 'unknown';
      this.logger.log(`webhook.connection-update instance=${instanceName} state=${state}`);
    }
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

      const jid = typeof contact.remoteJid === 'string' ? contact.remoteJid : null;
      const pushName = typeof contact.pushName === 'string' ? contact.pushName : null;

      if (jid && jid.includes('@s.whatsapp.net') && pushName) {
        const phone = jid.replace('@s.whatsapp.net', '');
        await this.redis.set(`contact:${phone}`, JSON.stringify({ pushName }));
      }
    }
  }
}
