import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import { EventPublisher } from '../realtime/event.publisher';
import { resolvePersonalJid } from '../core/whatsapp/jid.util';
import { ConversationIndexService } from '../conversation/conversation-index.service';
import { TenantRepository } from '../admin/tenant.repository';
import { N8nForwarderService } from './n8n-forwarder.service';

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
    private readonly forwarder: N8nForwarderService,
  ) {}

  async processEvolutionEvent(payload: Record<string, unknown>): Promise<void> {
    const event = payload.event as string | undefined;
    const instanceName = payload.instance as string | undefined;

    if (!event || !instanceName) {
      this.logger.debug('webhook.ignored: missing event or instance');
      return;
    }

    // The Evolution apikey is shared across instances, so a valid signature is
    // not enough: confirm the instance belongs to a known tenant before writing
    // anything to Redis. Otherwise a stray/foreign instance could seed data.
    const tenant = await this.tenants.get(instanceName);
    if (!tenant) {
      this.logger.warn(`webhook.unknown-instance: ${instanceName} (ignorado)`);
      return;
    }

    // Hub: reencaminha o payload cru pro N8N do tenant (transparente, idempotente,
    // fire-and-forget para nao segurar o ACK do webhook). Toda a logica IA-vs-humano
    // permanece no fluxo N8N do cliente. EXCECAO: `send.message` e a mensagem que a
    // PROPRIA IA enviou (via Evolution API) — o N8N nao precisa dela e reencaminhar
    // arriscaria loop; o BFF so a grava/publica para a resposta aparecer no painel.
    // `presence.update` (digitando/online) é efêmero e de alto volume — sinal de
    // UI, não de fluxo; nunca reencaminha pro N8N (evita flood).
    if (event !== 'send.message' && event !== 'presence.update') {
      void this.forwarder.forward(
        instanceName,
        tenant.n8nWebhookUrl ?? null,
        this.extractMsgId(payload),
        payload,
      );
    }

    switch (event) {
      case 'messages.upsert':
      case 'send.message':
        // `messages.upsert` = mensagens recebidas do WhatsApp (cliente/operador
        // no celular). `send.message` = mensagens enviadas via API (a resposta da
        // IA pelo N8N). Mesma estrutura de payload; ambas gravam + publicam pro
        // painel, com o rotulo (human/ai) derivado de `fromMe`.
        await this.handleMessageUpsert(instanceName, payload);
        break;
      case 'connection.update':
        await this.handleConnectionUpdate(instanceName, payload);
        break;
      case 'contacts.update':
      case 'contacts.upsert':
        await this.handleContactUpdate(instanceName, payload);
        break;
      case 'presence.update':
        await this.handlePresenceUpdate(instanceName, payload);
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

    // Persist message to chathistory:{instance}-{phone} (aligned with N8N).
    // Guarda a REFERÊNCIA da mídia (id da mensagem) — nunca o binário no Redis;
    // o proxy baixa a imagem descriptografada da Evolution sob demanda.
    const histKey = RedisKeys.chatHistory(instanceName, phone);
    const type = fromMe ? 'ai' : 'human';
    const media = this.extractMedia(data);
    const keyId = typeof key.id === 'string' ? key.id : null;
    const entry = JSON.stringify({
      type,
      data: { content },
      ...(media && keyId
        ? { media: { kind: media.kind, id: keyId, fromMe, mimetype: media.mimetype } }
        : {}),
    });
    await this.redis.rpush(histKey, entry);

    // Contador de nao-lidas: so conta mensagem RECEBIDA do cliente (fromMe=false).
    // A resposta da IA e o envio do operador (fromMe=true) nao geram badge. Zerado
    // quando o operador abre a conversa (ConversationService.markRead).
    if (!fromMe) {
      await this.redis.incr(RedisKeys.unread(instanceName, jid));
    }

    // Register the conversation in the per-tenant discovery index.
    await this.index.addJid(instanceName, jid);

    // Realtime direto: publica a mensagem no socket sem depender do keyspace
    // (que pode estar off no Redis gerenciado). O keyspace segue como reforco;
    // a UI e idempotente a um message.received duplicado (refaz o fetch).
    await this.publisher.publish({
      type: 'message.received',
      instancia: instanceName,
      jid,
      ts: Date.now(),
      payload: { fromMe },
    });

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

    // Update contact name if available (merge — preserva name/foto já gravados).
    const pushName = typeof data.pushName === 'string' ? data.pushName : null;
    if (pushName) {
      await this.upsertContact(instanceName, phone, { pushName });
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

  /**
   * Detecta se a mensagem carrega mídia (imagem/vídeo/áudio/documento) e devolve
   * o tipo + mimetype. Só a referência é guardada; o binário é baixado sob demanda
   * pelo proxy (getBase64FromMediaMessage).
   */
  private extractMedia(
    data: Record<string, unknown>,
  ): { kind: 'image' | 'video' | 'audio' | 'document'; mimetype: string | null } | null {
    const messageObj = data.message as Record<string, unknown> | undefined;
    if (!messageObj) return null;
    const fields: Array<[string, 'image' | 'video' | 'audio' | 'document']> = [
      ['imageMessage', 'image'],
      ['stickerMessage', 'image'],
      ['videoMessage', 'video'],
      ['audioMessage', 'audio'],
      ['documentMessage', 'document'],
    ];
    for (const [field, kind] of fields) {
      const m = messageObj[field] as Record<string, unknown> | undefined;
      if (m) {
        return { kind, mimetype: typeof m.mimetype === 'string' ? m.mimetype : null };
      }
    }
    return null;
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

    const prev = await this.redis.get(RedisKeys.instanceState(instanceName));

    // Persist to Redis
    await this.redis.set(RedisKeys.instanceState(instanceName), mappedState);

    // Update tenant registry
    await this.updateTenantConnectionState(instanceName, mappedState);

    // Push the change to the operator's UI in real time (only on transition, to
    // avoid spamming clients on repeated identical webhooks).
    if (prev !== mappedState) {
      await this.publisher.publish({
        type: 'connection.update',
        instancia: instanceName,
        jid: '',
        ts: Date.now(),
        payload: { state: mappedState },
      });
    }

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
      const name = this.pickContactName(contact);
      const profilePicUrl =
        typeof contact.profilePicUrl === 'string' ? contact.profilePicUrl : null;

      if (resolved && (name || profilePicUrl)) {
        await this.upsertContact(instanceName, resolved.phone, { name, profilePicUrl });
      }
    }

    // Invalidate caches
    await this.redis.del(RedisKeys.cacheContacts(instanceName));
    await this.redis.del(RedisKeys.cacheConversations(instanceName));
  }

  /**
   * Presença efêmera do contato (digitando/gravando/online). Extrai o estado do
   * payload `presence.update` da Evolution e publica direto no socket — sinal de
   * UI, sem persistir (o painel decide quando expira).
   */
  private async handlePresenceUpdate(
    instanceName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const data = payload.data as Record<string, unknown> | undefined;
    if (!data) return;

    const id = typeof data.id === 'string' ? data.id : undefined;
    const presences = data.presences as Record<string, unknown> | undefined;
    if (!id || !presences) return;

    const entry = presences[id] as Record<string, unknown> | undefined;
    const presence =
      entry && typeof entry.lastKnownPresence === 'string'
        ? entry.lastKnownPresence
        : undefined;
    if (!presence) return;

    const resolved = resolvePersonalJid(id, undefined);
    const jid = resolved?.jid ?? id;

    await this.publisher.publish({
      type: 'presence.update',
      instancia: instanceName,
      jid,
      ts: Date.now(),
      payload: { presence },
    });
  }

  /** Melhor nome de um contato da Evolution: agenda > verificado > público. */
  private pickContactName(c: Record<string, unknown>): string | null {
    for (const v of [c.name, c.verifiedName, c.pushName, c.notify]) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  }

  /**
   * Grava nome/foto do contato preservando os campos já existentes (merge). Assim
   * um `messages.upsert` (que só traz pushName) não apaga o profilePicUrl vindo
   * de um `contacts.upsert` anterior, e vice-versa.
   */
  private async upsertContact(
    inst: string,
    phone: string,
    fields: { name?: string | null; pushName?: string | null; profilePicUrl?: string | null },
  ): Promise<void> {
    const key = RedisKeys.contact(inst, phone);
    const existing = await this.redis.get(key);
    let parsed: Record<string, unknown> = {};
    if (existing) {
      try {
        parsed = JSON.parse(existing) as Record<string, unknown>;
      } catch {
        /* corrupted entry — overwrite */
      }
    }
    const merged: Record<string, unknown> = { ...parsed };
    if (fields.name) merged.name = fields.name;
    if (fields.pushName) merged.pushName = fields.pushName;
    if (fields.profilePicUrl) merged.profilePicUrl = fields.profilePicUrl;
    await this.redis.set(key, JSON.stringify(merged));
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

  /**
   * Extrai o id da mensagem (`data.key.id`) do payload da Evolution para o dedup
   * do reencaminhamento ao N8N. `data` pode ser um objeto ou um array de eventos.
   * Retorna null quando o evento nao carrega uma mensagem (ex.: connection.update).
   */
  private extractMsgId(payload: Record<string, unknown>): string | null {
    const data = payload.data as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined;
    const first = Array.isArray(data) ? data[0] : data;
    const key = (first as Record<string, unknown> | undefined)?.key as
      | Record<string, unknown>
      | undefined;
    return typeof key?.id === 'string' ? key.id : null;
  }
}
