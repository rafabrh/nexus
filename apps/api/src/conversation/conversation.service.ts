import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys, jidFromPhone } from '@nexus/shared';
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

    const name =
      str(c.name) ?? str(c.pushName) ?? str(legacy.name) ?? str(legacy.pushName);
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
    return this.repo.getMessages(instancia, jid, limit);
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

  async sendMessage(instancia: string, jid: string, text: string): Promise<{ message: string }> {
    await this.evolution.sendTextMessage(instancia, jid, text);

    const phone = jid.replace('@s.whatsapp.net', '');
    const histKey = RedisKeys.chatHistory(instancia, phone);
    const entry = JSON.stringify({ type: 'ai', data: { content: text, timestamp: Date.now() } });
    await this.redis.rpush(histKey, entry); // also fires keyspace message.received

    // Operator message = human takeover. Pause AI for 30min (V6.0 default).
    const until = Date.now() + 30 * 60 * 1000;
    await this.redis.set(RedisKeys.humanControlUntil(instancia, jid), String(until));

    await this.index.addJid(instancia, jid);
    await this.projection.project(instancia, jid);

    this.logger.log(`Message sent + persisted for ${instancia}/${jid}`);
    return { message: 'Mensagem enviada' };
  }

  /**
   * Reset the lead's transient state: clears human-takeover (re-enables the AI),
   * the processing flag and the message buffer. History, stage, tags and notes
   * are intentionally preserved — this only returns the conversation to the
   * automatic flow (mirrors the WhatsApp `reset` command, "safe" scope).
   */
  async resetState(instancia: string, jid: string): Promise<{ message: string }> {
    await Promise.all([
      this.redis.del(RedisKeys.humanControlUntil(instancia, jid)),
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
}
