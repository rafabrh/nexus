import { Injectable, NotFoundException, BadRequestException, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { FunnelStagesService } from '../funnel/funnel-stages.service';
import { QuickRepliesService } from '../quick-replies/quick-replies.service';
import { signMedia } from '../media/media-signature.util';
import { RedisKeys, jidFromPhone, PhoneMask } from '@nexus/shared';
import type {
  ConversationListItem,
  ConversationDetail,
  Message,
} from '@nexus/shared';
import { ConversationRepository } from './conversation.repository';
import { ConversationIndexService } from './conversation-index.service';
import { ConversationProjectionService } from './conversation-projection.service';
import { EvolutionClient } from '../whatsapp/evolution.client';
import { EventPublisher } from '../realtime/event.publisher';
import { controlJids } from '../core/whatsapp/control-jids.util';
import { ACK_CAS_LUA, highestAck } from '../core/whatsapp/ack-status.util';

/** Sufixos de host do CDN oficial WhatsApp/Meta que servem foto de perfil. */
const AVATAR_HOST_SUFFIXES = ['.whatsapp.net', '.fbcdn.net'] as const;
/** Teto do corpo da foto (5 MB) — fotos reais têm poucas centenas de KB. */
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * Confina a URL da foto ao CDN do WhatsApp/Meta sobre HTTPS. A URL é resolvida
 * pela Evolution (fonte externa/não-confiável) e buscada server-side pelo BFF —
 * sem esta allowlist o proxy de avatar vira um vetor de SSRF (buscaria qualquer
 * host interno, ex.: metadata/loopback, e devolveria os bytes ao cliente).
 */
function isAllowedAvatarUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return AVATAR_HOST_SUFFIXES.some(
    (sfx) => host === sfx.slice(1) || host.endsWith(sfx),
  );
}

/**
 * Lê o corpo da resposta com teto de bytes, cancelando o stream ao estourar —
 * evita exaustão de memória por uma resposta gigante (ou sem Content-Length).
 */
async function readCappedBody(resp: Response, maxBytes: number): Promise<Buffer> {
  const reader = resp.body?.getReader();
  if (!reader) {
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new NotFoundException('Foto de perfil indisponível');
    }
    return buf;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new NotFoundException('Foto de perfil indisponível');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly repo: ConversationRepository,
    private readonly evolution: EvolutionClient,
    private readonly publisher: EventPublisher,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly index: ConversationIndexService,
    private readonly projection: ConversationProjectionService,
    private readonly funnelStages: FunnelStagesService,
    private readonly quickReplies?: QuickRepliesService,
    private readonly config?: ConfigService,
  ) {}

  async listConversations(
    instancia: string,
    filters: { stage?: string; search?: string; aiState?: string },
  ): Promise<ConversationListItem[]> {
    // Lê da projeção Postgres: uma query indexada por (instancia, last_activity),
    // sem fan-out de N chaves Redis e sem o cache-aside de 30s que servia para
    // amortizar aquele fan-out. aiState é recomputado na leitura (sensível ao tempo).
    const items = await this.projection.list(instancia, filters);
    return this.enrichFromRedis(instancia, items);
  }

  /**
   * Enriquece a lista com o que vive no Redis (fora da projeção Postgres): o
   * contador de não-lidas, o nome e a foto do contato. Tudo num único pipeline
   * (3 GETs por conversa) — sem fan-out sequencial. Nome/foto vêm da chave por
   * tenant e, como fallback, da chave GLOBAL legada do N8N — recuperando os nomes
   * históricos que o namespacing por tenant deixou de ler.
   */
  private async enrichFromRedis(
    instancia: string,
    items: ConversationListItem[],
  ): Promise<ConversationListItem[]> {
    if (items.length === 0) return items;
    const pipeline = this.redis.pipeline();
    for (const item of items) {
      const phone = item.jid.replace('@s.whatsapp.net', '');
      pipeline.get(RedisKeys.unread(instancia, item.jid)); // 3i
      pipeline.get(RedisKeys.contact(instancia, phone)); // 3i+1
      pipeline.get(RedisKeys.contactGlobalLegacy(phone)); // 3i+2
    }
    const results = await pipeline.exec();
    return items.map((item, i) => {
      const unreadRaw = results?.[i * 3]?.[1] as string | null | undefined;
      const contactRaw = results?.[i * 3 + 1]?.[1] as string | null | undefined;
      const legacyRaw = results?.[i * 3 + 2]?.[1] as string | null | undefined;

      const count = unreadRaw ? parseInt(unreadRaw, 10) : 0;
      const { name, avatarUrl } = this.resolveContact(contactRaw, legacyRaw);

      return {
        ...item,
        unreadCount: Number.isFinite(count) && count > 0 ? count : 0,
        // Só sobrescreve o nome da projeção quando o Redis tem um nome melhor
        // (a projeção pode carregar apenas o telefone mascarado).
        contactName: name ?? item.contactName,
        ...(avatarUrl ? { avatarUrl } : {}),
      };
    });
  }

  /** Extrai nome/foto do contato: chave por tenant, com fallback na global do N8N. */
  private resolveContact(
    contactRaw: string | null | undefined,
    legacyRaw: string | null | undefined,
  ): { name: string | null; avatarUrl: string | null } {
    const parse = (raw: string | null | undefined): Record<string, unknown> => {
      if (!raw) return {};
      try {
        const v = JSON.parse(raw);
        return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
      } catch {
        // A chave global do N8N pode ser uma string simples (o próprio nome).
        return { name: raw };
      }
    };
    const c = parse(contactRaw);
    const legacy = parse(legacyRaw);
    const str = (v: unknown): string | null =>
      typeof v === 'string' && v.trim() ? v.trim() : null;
    // Nome mascarado (contém `*`) nunca vira nome de contato — cai no número real.
    const cleanName = (v: unknown): string | null => {
      const s = str(v);
      return s && !PhoneMask.isMasked(s) ? s : null;
    };

    const name =
      cleanName(c.name) ??
      cleanName(c.pushName) ??
      cleanName(legacy.name) ??
      cleanName(legacy.pushName);
    const avatarUrl = str(c.profilePicUrl) ?? str(legacy.profilePicUrl);
    return { name, avatarUrl };
  }

  async getConversationDetail(instancia: string, jid: string): Promise<ConversationDetail> {
    const detail = await this.repo.buildDetail(instancia, jid);
    if (!detail) {
      throw new NotFoundException(`Conversa ${jid} nao encontrada`);
    }
    return detail;
  }

  async getMessages(instancia: string, jid: string, limit: number): Promise<Message[]> {
    // Semeia os tiques (ACK) a partir da Evolution ANTES de ler — assim os tiques
    // aparecem já na abertura, mesmo para mensagens antigas e mesmo que o webhook
    // `messages.update` não tenha chegado. O webhook segue atualizando ao vivo.
    await this.seedAckStatusFromEvolution(instancia, jid);
    return this.repo.getMessages(instancia, jid, limit);
  }

  /**
   * Backfill dos tiques: puxa as mensagens da conversa no store da Evolution
   * (`findMessages`), extrai o ACK mais avançado de cada mensagem de SAÍDA
   * (`MessageUpdate`, que vem fora de ordem) e o grava no hash de ACK via CAS (nunca
   * rebaixa). O webhook `messages.update` é a fonte AO VIVO; este é o backfill de
   * abertura — necessário porque o webhook só emite em MUDANÇAS de status pós-envio,
   * então mensagens já entregues/lidas antes de a assinatura existir nunca teriam
   * tique sem isto. Throttled por conversa (marcador TTL) para não bater na Evolution
   * a cada refetch. Degrada em silêncio: se a Evolution falhar, as mensagens ainda
   * carregam (só sem tiques nesta rodada).
   */
  private async seedAckStatusFromEvolution(instancia: string, jid: string): Promise<void> {
    try {
      const marker = RedisKeys.ackSeededAt(instancia, jid);
      const fresh = await this.redis.set(marker, '1', 'EX', 45, 'NX');
      if (fresh !== 'OK') return; // semeado há pouco — evita hammer na Evolution

      const res = (await this.evolution.findMessages(instancia, jid)) as
        | Record<string, unknown>
        | unknown[]
        | null;
      const records = this.extractMessageRecords(res);
      if (records.length === 0) return;

      const hkey = RedisKeys.ackStatus(instancia, jid);
      for (const rec of records) {
        const key = rec.key as Record<string, unknown> | undefined;
        if (!key || key.fromMe !== true) continue; // tique só em mensagem de saída
        const msgId = typeof key.id === 'string' ? key.id : null;
        if (!msgId) continue;

        const updates = rec.MessageUpdate;
        if (!Array.isArray(updates) || updates.length === 0) continue;
        const status = highestAck(
          updates.map((u) => (u as Record<string, unknown>)?.status),
        );
        if (!status) continue;

        await this.redis.eval(ACK_CAS_LUA, 1, hkey, msgId, status);
      }
    } catch (err) {
      // Backfill é best-effort — nunca deve derrubar o carregamento das mensagens.
      this.logger.warn(
        `ack.seed-failed instancia=${instancia} jid=${jid}: ${(err as Error).message}`,
      );
    }
  }

  /** Normaliza os formatos de resposta possíveis do `findMessages` da Evolution. */
  private extractMessageRecords(res: unknown): Array<Record<string, unknown>> {
    const container = res as Record<string, unknown> | null;
    const candidate =
      (container?.messages as Record<string, unknown> | undefined)?.records ??
      container?.messages ??
      container?.records ??
      res;
    return Array.isArray(candidate)
      ? (candidate.filter(
          (m) => m && typeof m === 'object',
        ) as Array<Record<string, unknown>>)
      : [];
  }

  /**
   * Proxy de mídia: reconstrói a key a partir da referência guardada e baixa o
   * binário descriptografado da Evolution. O painel nunca lida com a URL
   * criptografada do WhatsApp.
   */
  async getMedia(
    instancia: string,
    jid: string,
    mediaId: string,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const ref = await this.repo.findMediaRef(instancia, jid, mediaId);
    if (!ref) {
      throw new NotFoundException('Mídia não encontrada');
    }
    const { base64, mimetype } = await this.evolution.getBase64FromMediaMessage(instancia, {
      id: mediaId,
      remoteJid: jid,
      fromMe: ref.fromMe,
    });
    if (!base64) {
      throw new NotFoundException('Mídia indisponível');
    }
    return {
      buffer: Buffer.from(base64, 'base64'),
      mimetype: mimetype || ref.mimetype || 'application/octet-stream',
    };
  }

  /**
   * Foto de perfil via proxy: resolve a URL na Evolution (fetchProfilePictureUrl)
   * — que não vem nos webhooks — cacheia por 6h e faz stream dos bytes. Contorna a
   * expiração/CORS da URL crua do pps.whatsapp.net. `url === ''` cacheado marca
   * "sem foto" e evita re-hit. Lança NotFound quando não há foto (front → iniciais).
   */
  async getAvatar(
    instancia: string,
    jid: string,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const phone = jid.replace('@s.whatsapp.net', '');
    const cacheKey = RedisKeys.avatar(instancia, phone);

    let url: string | null = null;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { url?: string };
        if (parsed.url === '') throw new NotFoundException('Sem foto de perfil');
        if (typeof parsed.url === 'string' && parsed.url) url = parsed.url;
      } catch (err) {
        if (err instanceof NotFoundException) throw err;
        /* cache corrompido — revalida abaixo */
      }
    }

    if (!url) {
      const resolved = await this.evolution.fetchProfilePictureUrl(instancia, jid);
      // URL ausente OU fora do CDN oficial → negativa-cacheia e degrada p/ iniciais.
      // Rejeitar aqui é a barreira anti-SSRF antes de qualquer fetch server-side.
      if (!resolved || !isAllowedAvatarUrl(resolved)) {
        if (resolved) {
          this.logger.warn(`getAvatar: URL de foto rejeitada (host nao permitido) para ${jid}`);
        }
        await this.redis.set(cacheKey, JSON.stringify({ url: '', ts: Date.now() }), 'EX', 1800);
        throw new NotFoundException('Sem foto de perfil');
      }
      url = resolved;
      await this.redis.set(cacheKey, JSON.stringify({ url, ts: Date.now() }), 'EX', 21600);
    } else if (!isAllowedAvatarUrl(url)) {
      // Cache legado com URL fora da allowlist — invalida e degrada.
      await this.redis.del(cacheKey);
      throw new NotFoundException('Sem foto de perfil');
    }

    let resp: Response;
    try {
      resp = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
    } catch (err) {
      // Timeout/rede/redirect bloqueado — não estoura 500, degrada p/ iniciais.
      await this.redis.del(cacheKey);
      this.logger.debug(`getAvatar fetch failed for ${jid}: ${(err as Error).message}`);
      throw new NotFoundException('Foto de perfil indisponível');
    }
    if (!resp.ok) {
      // URL expirada/indisponível — invalida o cache para revalidar no próximo acesso.
      await this.redis.del(cacheKey);
      throw new NotFoundException('Foto de perfil indisponível');
    }

    const mimetype = resp.headers.get('content-type') || 'image/jpeg';
    if (!mimetype.startsWith('image/')) {
      // Só servimos imagem — nunca repassa HTML/octet vindo de um host inesperado.
      throw new NotFoundException('Foto de perfil indisponível');
    }
    const buffer = await readCappedBody(resp, MAX_AVATAR_BYTES);
    return { buffer, mimetype };
  }

  async addNote(instancia: string, jid: string, text: string, userEmail: string): Promise<{ message: string }> {
    await this.repo.appendNote(instancia, jid, text);

    await this.publisher.publish({
      type: 'note.added',
      instancia,
      jid,
      ts: Date.now(),
      payload: { text, addedBy: userEmail },
    });

    this.logger.log(`Note added by ${userEmail} for ${instancia}/${jid}`);
    return { message: 'Nota adicionada' };
  }

  async removeNote(instancia: string, jid: string, index: number): Promise<{ message: string }> {
    await this.repo.removeNote(instancia, jid, index);
    return { message: 'Nota removida' };
  }

  async addTag(instancia: string, jid: string, tag: string): Promise<{ message: string }> {
    await this.repo.addTag(instancia, jid, tag);
    await this.projection.project(instancia, jid); // tags não são watched por keyspace
    return { message: 'Tag adicionada' };
  }

  async removeTag(instancia: string, jid: string, tag: string): Promise<{ message: string }> {
    await this.repo.removeTag(instancia, jid, tag);
    await this.projection.project(instancia, jid);
    return { message: 'Tag removida' };
  }

  /**
   * Human takeover: garante uma pausa da IA de no mínimo `floorMs` a partir de
   * agora — SEM nunca rebaixar uma pausa mais longa já existente. O Switch OFF
   * permanente do painel grava `4102444800000` (~ano 2100); mandar uma mensagem
   * ou mídia pelo painel é um takeover, mas não pode REATIVAR a IA que o
   * operador desligou — só estender a janela humana. Escreve nas chaves canônica
   * + cru (@lid) que o N8N também checa, com TTL de 1 ano (igual ao
   * AiControlService). Antes disso, um `set` incondicional de `now + 30min`
   * rebaixava o OFF permanente para uma pausa curta que expirava e reativava a IA.
   */
  private async pauseAiForHumanTakeover(
    instancia: string,
    jid: string,
    floorMs: number,
  ): Promise<void> {
    const floor = Date.now() + floorMs;
    const targets = await controlJids(this.redis, instancia, jid);
    await Promise.all(
      targets.map(async (j) => {
        const key = RedisKeys.humanControlUntil(instancia, j);
        const existing = await this.redis.get(key);
        const existingMs = existing ? Number(existing) : NaN;
        const until = !Number.isNaN(existingMs) && existingMs > floor ? existingMs : floor;
        await this.redis.set(key, String(until), 'EX', 31_536_000);
      }),
    );
  }

  async sendMessage(
    instancia: string,
    jid: string,
    text: string,
    quotedId?: string,
  ): Promise<{ message: string }> {
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);

    // Responder/quote: monta a citação a partir do histórico (preview + fromMe) para
    // o balão enviado e a Evolution referenciarem a mensagem original.
    const quoted = quotedId ? await this.buildQuoted(instancia, phone, quotedId) : null;

    const res = await this.evolution.sendTextMessage(
      instancia,
      jid,
      text,
      quoted ? { id: quoted.id, text: quoted.preview } : undefined,
    );
    const sentKey = (res?.key ?? {}) as Record<string, unknown>;
    const msgId = typeof sentKey.id === 'string' ? sentKey.id : null;

    const entry = JSON.stringify({
      type: 'ai',
      data: { content: text, timestamp: Date.now() },
      ...(msgId ? { id: msgId } : {}),
      ...(quoted ? { quoted } : {}),
    });
    await this.redis.rpush(histKey, entry); // also fires keyspace message.received

    // Mensagem do operador = human takeover → pausa a IA por 30min (padrão V6.0),
    // mas NUNCA rebaixa um OFF mais longo/permanente já setado pelo operador.
    await this.pauseAiForHumanTakeover(instancia, jid, 30 * 60 * 1000);

    await this.index.addJid(instancia, jid);
    await this.projection.project(instancia, jid);

    this.logger.log(`Message sent + persisted for ${instancia}/${jid}`);
    return { message: 'Mensagem enviada' };
  }

  /**
   * Monta a referência de citação a partir do histórico: localiza a mensagem pelo
   * id (key.id) e extrai um preview curto + se era de saída (fromMe). Se não achar,
   * cita só pelo id (a Evolution ainda referencia a original pelo id).
   */
  private async buildQuoted(
    instancia: string,
    phone: string,
    quotedId: string,
  ): Promise<{ id: string; preview: string; fromMe: boolean }> {
    try {
      const raw = await this.redis.lrange(
        RedisKeys.chatHistory(instancia, phone),
        -200,
        -1,
      );
      for (const item of raw) {
        try {
          const p = JSON.parse(item);
          if (p?.id === quotedId) {
            const content = typeof p?.data?.content === 'string' ? p.data.content : '';
            return { id: quotedId, preview: content.slice(0, 120), fromMe: p?.type === 'ai' };
          }
        } catch {
          /* entrada malformada — ignora */
        }
      }
    } catch (err) {
      this.logger.debug(`buildQuoted lookup failed: ${(err as Error).message}`);
    }
    return { id: quotedId, preview: '', fromMe: false };
  }

  /**
   * Reset the lead's transient state: clears human-takeover (re-enables the AI),
   * the processing flag and the message buffer. History, stage, tags and notes
   * are intentionally preserved — this only returns the conversation to the
   * automatic flow (mirrors the WhatsApp `reset` command, "safe" scope).
   */
  async resetState(instancia: string, jid: string): Promise<{ message: string }> {
    const jids = await controlJids(this.redis, instancia, jid);
    await Promise.all([
      ...jids.map((j) => this.redis.del(RedisKeys.humanControlUntil(instancia, j))),
      this.redis.del(RedisKeys.processing(instancia, jid)),
      this.redis.del(RedisKeys.buffer(instancia, jid)),
    ]);
    await this.projection.project(instancia, jid);
    this.logger.log(`Conversation state reset for ${instancia}/${jid}`);
    return { message: 'Estado resetado' };
  }

  /**
   * Update the funnel stage (followup_step) for a conversation.
   */
  async updateStage(instancia: string, jid: string, stage: string): Promise<{ message: string; stage: string }> {
    // O funil é dinâmico por-tenant: o `stage` precisa ser o `key` de um estágio
    // real de `funnel_stages` daquele tenant. Rejeita (400) um key inexistente —
    // sem isto, um arraste/connector poderia gravar um followup_step órfão que
    // nenhuma coluna renderiza. Mantém o contrato do Redis (grava o key abaixo).
    const validStage = await this.funnelStages.keyExists(instancia, stage);
    if (!validStage) {
      throw new BadRequestException(
        `Estágio "${stage}" não existe para este tenant`,
      );
    }

    // Defense-in-depth: a bare phone (e.g. from a Sheets-keyed caller) is
    // normalized to the canonical JID so the followup_step key and the emitted
    // event jid match what N8N and the panel use.
    const canonicalJid = jidFromPhone(jid);
    const key = RedisKeys.followupStep(instancia, canonicalJid);
    await this.redis.set(key, stage);
    await this.index.addJid(instancia, canonicalJid);
    await this.projection.project(instancia, canonicalJid);

    await this.publisher.publish({
      type: 'funnel.changed',
      instancia,
      jid: canonicalJid,
      ts: Date.now(),
      payload: { stage },
    });

    this.logger.log(`Stage updated to ${stage} for ${instancia}/${canonicalJid}`);
    return { message: 'Stage atualizado', stage };
  }

  /**
   * Toggle manual isHot flag for a conversation.
   */
  async toggleHot(instancia: string, jid: string, isHot: boolean): Promise<{ message: string; isHot: boolean }> {
    const key = RedisKeys.isHot(instancia, jid);
    if (isHot) {
      await this.redis.set(key, 'true');
    } else {
      await this.redis.del(key);
    }
    await this.projection.project(instancia, jid); // isHot manual não é watched por keyspace

    await this.publisher.publish({
      type: 'lead.hot',
      instancia,
      jid,
      ts: Date.now(),
      payload: { isHot, manual: true },
    });

    this.logger.log(`isHot toggled to ${isHot} for ${instancia}/${jid}`);
    return { message: isHot ? 'Lead marcado como hot' : 'Lead removido de hot', isHot };
  }

  /**
   * Marca a conversa como lida: zera o contador de não-lidas e publica
   * `conversation.read` para sincronizar outros dispositivos/abas do mesmo tenant
   * (o painel deles refaz a lista e o badge some). Idempotente (DEL).
   */
  async markRead(instancia: string, jid: string): Promise<{ message: string }> {
    await this.redis.del(RedisKeys.unread(instancia, jid));

    await this.publisher.publish({
      type: 'conversation.read',
      instancia,
      jid,
      ts: Date.now(),
      payload: {},
    });

    this.logger.log(`Conversation marked read for ${instancia}/${jid}`);
    return { message: 'Marcado como lido' };
  }

  /**
   * Salva/edita o nome do contato (sobrepõe o pushName da Evolution). Nome vazio
   * remove a sobreposição — volta ao pushName. Reprojeta para a lista e o detalhe
   * refletirem imediatamente.
   */
  async saveContactName(
    instancia: string,
    jid: string,
    name: string,
  ): Promise<{ message: string }> {
    const phone = jid.replace('@s.whatsapp.net', '');
    const key = RedisKeys.contact(instancia, phone);
    const existing = await this.redis.get(key);
    let parsed: Record<string, unknown> = {};
    if (existing) {
      try {
        parsed = JSON.parse(existing) as Record<string, unknown>;
      } catch {
        /* corrupted — overwrite */
      }
    }
    const trimmed = name.trim();
    if (trimmed) {
      parsed.name = trimmed;
    } else {
      delete parsed.name;
    }
    await this.redis.set(key, JSON.stringify(parsed));
    await this.projection.project(instancia, jid);
    this.logger.log(
      `Contact name ${trimmed ? 'saved' : 'cleared'} for ${instancia}/${jid}`,
    );
    return { message: trimmed ? 'Contato salvo' : 'Nome removido' };
  }

  /**
   * Envia mídia (imagem/vídeo/documento) via Evolution e grava a referência no
   * histórico pra aparecer na thread (a foto é servida pelo proxy `getMedia`).
   * Envio do operador = human takeover: pausa a IA por 30min, como no texto.
   */
  async sendMediaMessage(
    instancia: string,
    jid: string,
    opts: {
      mediatype: 'image' | 'video' | 'document';
      media: string;
      fileName?: string;
      caption?: string;
      mimetype?: string;
    },
  ): Promise<{ message: string }> {
    const res = await this.evolution.sendMedia(instancia, jid, opts);

    // Grava a referência da mídia enviada (id retornado) no chathistory.
    const key = (res?.key ?? {}) as Record<string, unknown>;
    const msgId = typeof key.id === 'string' ? key.id : null;
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);
    const entry = JSON.stringify({
      type: 'ai',
      data: { content: opts.caption ?? '' },
      ...(msgId
        ? { media: { kind: opts.mediatype, id: msgId, fromMe: true, mimetype: opts.mimetype ?? null } }
        : {}),
    });
    await this.redis.rpush(histKey, entry);

    await this.pauseAiForHumanTakeover(instancia, jid, 30 * 60 * 1000);
    await this.index.addJid(instancia, jid);
    await this.projection.project(instancia, jid);

    this.logger.log(`Media sent + persisted for ${instancia}/${jid} (${opts.mediatype})`);
    return { message: 'Mídia enviada' };
  }

  /**
   * Envia uma nota de voz gravada no painel via Evolution e grava a referência no
   * histórico (o áudio é servido pelo proxy `getMedia`, igual às demais mídias).
   * Envio do operador = human takeover: pausa a IA por 30min, como texto/mídia.
   */
  async sendAudioMessage(
    instancia: string,
    jid: string,
    audio: string,
    mimetype?: string,
  ): Promise<{ message: string }> {
    const res = await this.evolution.sendWhatsAppAudio(instancia, jid, audio);

    const key = (res?.key ?? {}) as Record<string, unknown>;
    const msgId = typeof key.id === 'string' ? key.id : null;
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);
    const entry = JSON.stringify({
      type: 'ai',
      data: { content: '', timestamp: Date.now() },
      ...(msgId ? { id: msgId } : {}),
      ...(msgId
        ? { media: { kind: 'audio', id: msgId, fromMe: true, mimetype: mimetype ?? null } }
        : {}),
    });
    await this.redis.rpush(histKey, entry);

    await this.pauseAiForHumanTakeover(instancia, jid, 30 * 60 * 1000);
    await this.index.addJid(instancia, jid);
    await this.projection.project(instancia, jid);

    this.logger.log(`Audio sent + persisted for ${instancia}/${jid}`);
    return { message: 'Áudio enviado' };
  }

  /**
   * Envia um cartão de contato (vCard) via Evolution e grava no histórico uma
   * linha textual legível — a bolha mostra só texto, sem precisar de um novo
   * tipo de render. Envio do operador = human takeover: pausa a IA por 30min,
   * como texto/mídia/áudio.
   */
  async sendContactMessage(
    instancia: string,
    jid: string,
    dto: { fullName: string; phoneNumber: string; organization?: string; email?: string },
  ): Promise<{ message: string }> {
    const res = await this.evolution.sendContact(instancia, jid, dto);

    const key = (res?.key ?? {}) as Record<string, unknown>;
    const msgId = typeof key.id === 'string' ? key.id : null;
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);
    const entry = JSON.stringify({
      type: 'ai',
      data: { content: `📇 Contato: ${dto.fullName} — ${dto.phoneNumber}`, timestamp: Date.now() },
      ...(msgId ? { id: msgId } : {}),
    });
    await this.redis.rpush(histKey, entry);

    await this.pauseAiForHumanTakeover(instancia, jid, 30 * 60 * 1000);
    await this.index.addJid(instancia, jid);
    await this.projection.project(instancia, jid);

    this.logger.log(`Contact sent + persisted for ${instancia}/${jid}`);
    return { message: 'Contato enviado' };
  }

  /**
   * Envia uma localização (pin no mapa) via Evolution e grava no histórico uma
   * linha textual legível — mesma estratégia do contato: só texto na bolha.
   * Envio do operador = human takeover: pausa a IA por 30min.
   */
  async sendLocationMessage(
    instancia: string,
    jid: string,
    dto: { latitude: number; longitude: number; name?: string; address?: string },
  ): Promise<{ message: string }> {
    const res = await this.evolution.sendLocation(instancia, jid, dto);

    const key = (res?.key ?? {}) as Record<string, unknown>;
    const msgId = typeof key.id === 'string' ? key.id : null;
    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);
    // Rótulo opcional (nome/endereço) enriquece a bolha quando vier preenchido.
    const label = [dto.name, dto.address].filter(Boolean).join(' — ');
    const content = label ? `📍 Localização: ${label}` : '📍 Localização enviada';
    const entry = JSON.stringify({
      type: 'ai',
      data: { content, timestamp: Date.now() },
      ...(msgId ? { id: msgId } : {}),
    });
    await this.redis.rpush(histKey, entry);

    await this.pauseAiForHumanTakeover(instancia, jid, 30 * 60 * 1000);
    await this.index.addJid(instancia, jid);
    await this.projection.project(instancia, jid);

    this.logger.log(`Location sent + persisted for ${instancia}/${jid}`);
    return { message: 'Localização enviada' };
  }

  /**
   * Envia uma resposta rápida pelo id: busca o QR do tenant, e se tiver mídia
   * gera uma URL assinada (válida 5min) para a Evolution buscar o arquivo em
   * disco — nunca envia base64. Vídeos acima de 16 MB são enviados como
   * documento para evitar rejeição da Evolution. Sem mídia, envia como texto.
   */
  async sendQuickReply(
    instancia: string,
    jid: string,
    qrId: string,
  ): Promise<{ message: string }> {
    if (!this.quickReplies) {
      throw new Error('QuickRepliesService not injected');
    }
    const row = await this.quickReplies.getOwned(instancia, qrId);

    // Monta o bloco de mídia a partir das colunas da linha (mesmo shape do toDto).
    const media =
      row.mediaId && row.mediaType && row.mediaMimetype
        ? {
            id: row.mediaId,
            type: row.mediaType as 'image' | 'video',
            mimetype: row.mediaMimetype,
            filename: row.mediaFilename ?? '',
            size: row.mediaSize ?? 0,
          }
        : null;

    if (!media) {
      // Sem mídia — envia como texto reutilizando o método existente.
      return this.sendMessage(instancia, jid, row.content ?? '');
    }

    const secret = this.config!.getOrThrow<string>('MEDIA_SIGN_SECRET');
    const base = this.config!.get<string>('APP_BASE_URL', 'http://localhost:4000');
    const { exp, sig } = signMedia(instancia, media.id, 300, secret);
    const url = `${base}/api/v1/public/qr-media/${media.id}?inst=${encodeURIComponent(instancia)}&exp=${exp}&sig=${sig}`;

    const over16 = media.size > 16 * 1024 * 1024;
    const mediatype = media.type === 'video' && over16 ? 'document' : media.type;

    await this.sendMediaMessage(instancia, jid, {
      mediatype,
      media: url,
      caption: row.content ?? undefined,
      mimetype: media.mimetype,
      fileName: media.filename,
    });

    return { message: 'Resposta rápida enviada' };
  }
}
