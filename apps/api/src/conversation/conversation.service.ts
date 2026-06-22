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
    return this.projection.list(instancia, filters);
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
}
