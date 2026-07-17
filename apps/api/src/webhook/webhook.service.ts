import { Injectable, Inject, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys, PhoneMask } from '@nexus/shared';
import { EventPublisher } from '../realtime/event.publisher';
import { resolvePersonalJid } from '../core/whatsapp/jid.util';
import { isAiOff } from '../core/whatsapp/ai-off.util';
import { ACK_CAS_LUA, mapEvolutionAck, type AckStatus } from '../core/whatsapp/ack-status.util';
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

/**
 * Quantas entradas recentes do chathistory varrer ao checar se um envio já foi
 * persistido (dedup do eco). O eco da Evolution chega poucos instantes após o
 * envio, então o WAMID estará entre as últimas mensagens — a janela é folgada.
 */
const ECHO_SCAN_WINDOW = 50;

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
    // `presence.update` (digitando/online) e `messages.update` (ACK de entregue/
    // lido) são efêmeros e de alto volume — sinal de UI, não de fluxo; nunca
    // reencaminham pro N8N (evita flood).
    if (
      event !== 'send.message' &&
      event !== 'presence.update' &&
      event !== 'messages.update'
    ) {
      // BFF-gate do controle de IA: quando a conversa está com a IA desligada, o
      // BFF NÃO reencaminha a mensagem pro N8N — o desligamento é enforçado aqui,
      // na origem. O gate interno do fluxo N8N se provou inconfiável (lê o
      // `humanControlUntil` correto e responde assim mesmo), então o hub barra.
      // Só mensagens entram na checagem; demais eventos (connection, contacts)
      // seguem sempre. O painel continua gravando/publicando a mensagem normal.
      const aiOff =
        event === 'messages.upsert' && (await this.isInboundAiOff(instanceName, payload));
      if (aiOff) {
        this.logger.log(
          `n8n.forward-gated instancia=${instanceName} reason=ai-off (human takeover)`,
        );
      } else {
        void this.forwarder.forward(
          instanceName,
          tenant.n8nWebhookUrl ?? null,
          this.extractMsgId(payload),
          payload,
        );
      }
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
      case 'messages.update':
        await this.handleMessageUpdate(instanceName, payload);
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

    // POC status/stories: detecta se a Evolution repassa `status@broadcast` (hoje
    // descartado como broadcast). Só LOGA — não processa como conversa. Serve pra
    // medir a viabilidade de uma futura aba de Status antes de investir no
    // subsistema (efêmero 24h, mídia, viewer). Se este log nunca aparecer, a
    // Evolution não expõe status e a feature fica inviável sem outra fonte.
    if (typeof key.remoteJid === 'string' && key.remoteJid.includes('status@broadcast')) {
      this.logger.log(
        `status.detected instance=${instanceName} author=${
          (key.participant as string) ?? (key.remoteJidAlt as string) ?? '?'
        }`,
      );
      return;
    }

    // Resolve canonical phone/JID, handling both legacy @s.whatsapp.net and
    // @lid addressing (real phone in key.remoteJidAlt). Skip groups/broadcasts.
    const resolved = resolvePersonalJid(
      key.remoteJid as string | undefined,
      key.remoteJidAlt as string | undefined,
    );
    if (!resolved) return;
    const { phone, jid } = resolved;

    // O N8N indexa as chaves de conversa pelo `key.remoteJid` CRU (com @lid, é
    // `{lid}@lid`), enquanto o painel usa o JID canônico. Guarda o mapa canônico
    // -> cru para o controle de IA (humanControlUntil) convergir nos dois — sem
    // isto, o OFF do painel grava numa chave que o N8N nunca checa.
    if (typeof key.remoteJid === 'string' && key.remoteJid !== jid) {
      await this.redis.set(RedisKeys.rawJid(instanceName, jid), key.remoteJid);
    }

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
    const timestamp = this.extractTimestamp(data);
    const quoted = this.extractQuoted(data, fromMe);
    const entry = JSON.stringify({
      type,
      data: { content, ...(timestamp ? { timestamp } : {}) },
      ...(keyId ? { id: keyId } : {}),
      ...(quoted ? { quoted } : {}),
      ...(media && keyId
        ? { media: { kind: media.kind, id: keyId, fromMe, mimetype: media.mimetype } }
        : {}),
    });
    // Eco do próprio envio. O painel grava a bolha no ENVIO; a Evolution devolve
    // a mesma mensagem de volta (`send.message` e/ou `messages.upsert` fromMe=true)
    // e um mesmo envio pode chegar em mais de um evento. Regravar aqui duplicaria a
    // bolha na visão do operador (o destinatário recebe só uma). Três casos:
    //  1) MESMO WAMID repetido (send.message + messages.upsert) → barrado por id.
    //  2) mídia visual (imagem/vídeo/doc) do painel: a bolha otimista foi gravada
    //     SEM `id` no topo (só `media.id`), e o `sendMedia` devolve um id que NEM
    //     SEMPRE bate com o WAMID do eco (o áudio bate; a mídia visual não). Como o
    //     id não casa, reconciliamos pela mídia otimista pendente do mesmo tipo,
    //     substituindo-a pelo eco (que traz o WAMID real, usado pelo proxy).
    //  3) resposta da IA (N8N) ou envio de outro device: sem otimista → grava.
    // O restante (índice, realtime, cache) segue em qualquer caso.
    if (fromMe && keyId && (await this.isMessageAlreadyStored(histKey, keyId))) {
      /* eco repetido do mesmo WAMID — nada a persistir */
    } else if (fromMe && media && keyId) {
      const reconciled = await this.reconcileOutgoingMedia(histKey, media.kind, entry);
      if (!reconciled) await this.redis.rpush(histKey, entry);
    } else {
      await this.redis.rpush(histKey, entry);
    }

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
    // SÓ em mensagem RECEBIDA (fromMe=false): num eco do próprio envio o
    // `data.pushName` é o nome do DONO da instância ("SHK Group"/"Você"), nunca
    // o do contato — gravá-lo aqui poluiria o registro e faria o nome oscilar.
    const pushName = typeof data.pushName === 'string' ? data.pushName : null;
    if (pushName && !fromMe) {
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
   * True quando uma mensagem de saída com este WAMID já está no chathistory
   * recente — evita persistir o eco do próprio envio (o painel grava no envio; a
   * Evolution pode devolver a mesma mensagem em `send.message` e/ou
   * `messages.upsert`). Varre só as últimas entradas (o eco chega logo após o
   * envio). Confere o id no topo e em `media.id` (mídia enviada pelo painel guarda
   * o WAMID só em `media.id`).
   */
  private async isMessageAlreadyStored(histKey: string, msgId: string): Promise<boolean> {
    const recent = await this.redis.lrange(histKey, -ECHO_SCAN_WINDOW, -1);
    for (const item of recent) {
      try {
        const parsed = JSON.parse(item);
        const media = parsed.media as { id?: string } | undefined;
        const id = (typeof parsed.id === 'string' && parsed.id) || media?.id || null;
        if (id === msgId) return true;
      } catch {
        /* entrada malformada — ignora */
      }
    }
    return false;
  }

  /**
   * Reconcilia o eco de uma mídia de SAÍDA (imagem/vídeo/documento) com a bolha
   * otimista que o painel gravou no envio. Essa bolha (ConversationService.
   * sendMediaMessage) NÃO tem `id` no topo — só `media.id`, que para mídia visual
   * pode divergir do WAMID do eco (o `sendMedia` devolve um id que nem sempre bate
   * com o do eco; o áudio bate e por isso não passa por aqui — sua bolha otimista
   * grava o `id` no topo e casa pela dedup por WAMID). Localiza a otimista pendente
   * mais antiga do mesmo tipo (saída, mesma mídia, SEM `id` no topo) e a SUBSTITUI
   * pelo eco (que traz o WAMID real). Assim não nasce uma 2ª bolha, sem depender de
   * o id do envio bater com o do eco. `lrem` por valor é atômico e imune a mudança
   * de posição na lista. Retorna true se reconciliou.
   */
  private async reconcileOutgoingMedia(
    histKey: string,
    kind: string,
    echoEntry: string,
  ): Promise<boolean> {
    const recent = await this.redis.lrange(histKey, -ECHO_SCAN_WINDOW, -1);
    for (const raw of recent) {
      try {
        const parsed = JSON.parse(raw);
        const hasTopId = typeof parsed.id === 'string' && parsed.id.length > 0;
        const media = parsed.media as { kind?: string } | undefined;
        if (parsed.type === 'ai' && !hasTopId && media && media.kind === kind) {
          await this.redis.lrem(histKey, 1, raw);
          await this.redis.rpush(histKey, echoEntry);
          return true;
        }
      } catch {
        /* entrada malformada — ignora */
      }
    }
    return false;
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

  /** Timestamp da mensagem (a Evolution manda em segundos) → ms. Null se ausente. */
  private extractTimestamp(data: Record<string, unknown>): number | null {
    const t = data.messageTimestamp;
    const n = typeof t === 'number' ? t : typeof t === 'string' ? parseInt(t, 10) : NaN;
    if (!Number.isFinite(n) || n <= 0) return null;
    // Valores em segundos (< 10^12) são normalizados para ms.
    return n < 1e12 ? n * 1000 : n;
  }

  /**
   * Extrai a citação (quote) quando a mensagem responde outra. O `contextInfo` (com
   * `stanzaId` + `quotedMessage`) aparece em extendedTextMessage e nos tipos de
   * mídia. O `fromMe` da citada é aproximado como o oposto da atual (num vai-e-volta
   * típico) — só um indicador visual do balão. Retorna null quando não há citação.
   */
  private extractQuoted(
    data: Record<string, unknown>,
    fromMe: boolean,
  ): { id: string; preview: string; fromMe: boolean } | null {
    const message = data.message as Record<string, unknown> | undefined;
    if (!message) return null;
    let ctx: Record<string, unknown> | undefined;
    for (const v of Object.values(message)) {
      if (v && typeof v === 'object' && 'contextInfo' in (v as Record<string, unknown>)) {
        ctx = (v as Record<string, unknown>).contextInfo as Record<string, unknown>;
        break;
      }
    }
    const stanzaId = ctx && typeof ctx.stanzaId === 'string' ? ctx.stanzaId : null;
    if (!stanzaId) return null;
    const quotedMsg = ctx?.quotedMessage as Record<string, unknown> | undefined;
    const preview = quotedMsg ? this.extractContent({ message: quotedMsg }) ?? '' : '';
    return { id: stanzaId, preview: preview.slice(0, 120), fromMe: !fromMe };
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

  /**
   * `messages.update` = mudança de ACK (entregue/lido/reproduzido) de uma mensagem
   * já enviada. Só interessa o status das mensagens de SAÍDA (fromMe): grava no
   * hash lateral de ACK e publica `message.status` para o painel pintar os tiques
   * ao vivo. Nunca reencaminhado ao N8N (alto volume, sinal de UI).
   */
  private async handleMessageUpdate(
    instanceName: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const dataObj = payload.data;
    const items = Array.isArray(dataObj) ? dataObj : dataObj ? [dataObj] : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const data = item as Record<string, unknown>;
      const key = data.key as Record<string, unknown> | undefined;
      if (!key || key.fromMe !== true) continue; // só o ACK das NOSSAS mensagens
      const msgId = typeof key.id === 'string' ? key.id : null;
      if (!msgId) continue;

      const status = this.mapAckStatus(data);
      if (!status) continue;

      const resolved = resolvePersonalJid(
        key.remoteJid as string | undefined,
        key.remoteJidAlt as string | undefined,
      );
      if (!resolved) continue;
      const { jid } = resolved;

      const advanced = await this.upsertAckStatus(instanceName, jid, msgId, status);
      if (!advanced) continue; // update fora de ordem não rebaixa o status

      // Tique é sinal de UI de alto volume: entrega ao vivo, mas NÃO persiste no
      // stream de replay (a janela é finita; o estado real vive no hash de ACK).
      await this.publisher.publish(
        {
          type: 'message.status',
          instancia: instanceName,
          jid,
          ts: Date.now(),
          payload: { id: msgId, status },
        },
        { persistToStream: false },
      );
    }
  }

  /**
   * Extrai o status de ACK do payload `messages.update` (campo `status` no topo ou
   * dentro de `update`) e mapeia para o enum do painel via util compartilhado.
   */
  private mapAckStatus(data: Record<string, unknown>): AckStatus | null {
    const raw =
      (data.status as unknown) ??
      ((data.update as Record<string, unknown> | undefined)?.status as unknown);
    return mapEvolutionAck(raw);
  }

  /**
   * Grava o status no hash de ACK apenas quando é um AVANÇO (sent<delivered<read<
   * played) — updates da Evolution podem chegar fora de ordem/concorrentes. O
   * compare-and-set roda atômico no Redis (ACK_CAS_LUA). Retorna se avançou.
   */
  private async upsertAckStatus(
    inst: string,
    jid: string,
    msgId: string,
    status: AckStatus,
  ): Promise<boolean> {
    const hkey = RedisKeys.ackStatus(inst, jid);
    const advanced = await this.redis.eval(
      ACK_CAS_LUA,
      1,
      hkey,
      msgId,
      status,
    );
    return advanced === 1;
  }

  /** Melhor nome de um contato da Evolution: agenda > verificado > público. */
  private pickContactName(c: Record<string, unknown>): string | null {
    for (const v of [c.name, c.verifiedName, c.pushName, c.notify]) {
      if (typeof v === 'string' && v.trim() && !PhoneMask.isMasked(v)) return v.trim();
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
    // Nunca persiste nome mascarado (contém `*`) — o painel exibiria a máscara.
    if (fields.name && !PhoneMask.isMasked(fields.name)) merged.name = fields.name;
    if (fields.pushName && !PhoneMask.isMasked(fields.pushName)) {
      merged.pushName = fields.pushName;
    }
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
  /**
   * Extrai o `key` da primeira mensagem do payload da Evolution. `data` pode ser
   * um objeto único ou um array de eventos. Retorna null quando o evento nao
   * carrega uma mensagem (ex.: connection.update).
   */
  private firstMessageKey(payload: Record<string, unknown>): Record<string, unknown> | null {
    const data = payload.data as
      | Record<string, unknown>
      | Record<string, unknown>[]
      | undefined;
    const first = Array.isArray(data) ? data[0] : data;
    const key = (first as Record<string, unknown> | undefined)?.key;
    return key && typeof key === 'object' ? (key as Record<string, unknown>) : null;
  }

  private extractMsgId(payload: Record<string, unknown>): string | null {
    const id = this.firstMessageKey(payload)?.id;
    return typeof id === 'string' ? id : null;
  }

  /**
   * BFF-gate: true quando a conversa da mensagem recebida está com a IA
   * desligada — nesse caso o BFF nao reencaminha o payload pro N8N. Resolve o
   * mesmo JID canonico que o painel usa e checa `humanControlUntil` (canonica +
   * cru @lid), idêntico ao `AiControlService.getState`.
   *
   * EXCEÇÃO: o self-chat do dono (fromMe=true numa conversa consigo mesmo,
   * `remoteJid` == `sender` que a Evolution injeta na raiz do webhook) é o canal
   * de comandos de admin do fluxo N8N (/help, /tpl, on/off...) — NUNCA é gated.
   * Sem isto, o takeover de 30min disparado por qualquer envio manual do painel
   * pro próprio número silenciava os comandos.
   */
  private async isInboundAiOff(
    instanceName: string,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    const key = this.firstMessageKey(payload);
    if (!key) return false;
    const resolved = resolvePersonalJid(
      key.remoteJid as string | undefined,
      key.remoteJidAlt as string | undefined,
    );
    if (!resolved) return false;
    const sender = typeof payload.sender === 'string' ? payload.sender : '';
    if (key.fromMe === true && sender && resolved.jid === sender) return false;
    return isAiOff(this.redis, instanceName, resolved.jid);
  }
}
