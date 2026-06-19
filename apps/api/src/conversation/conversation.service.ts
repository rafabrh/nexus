import { Injectable, NotFoundException, Logger, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import type {
  ConversationListItem,
  ConversationDetail,
  Message,
} from '@nexus/shared';
import { ConversationRepository } from './conversation.repository';
import { ConversationIndexService } from './conversation-index.service';
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
  ) {}

  async listConversations(
    instancia: string,
    filters: { stage?: string; search?: string; aiState?: string },
  ): Promise<ConversationListItem[]> {
    // Cache-aside: check for cached result (only for unfiltered requests)
    const hasFilters = filters.stage || filters.search || filters.aiState;
    if (!hasFilters) {
      const cached = await this.redis.get(RedisKeys.cacheConversations(instancia));
      if (cached) {
        try {
          return JSON.parse(cached) as ConversationListItem[];
        } catch {
          // Corrupted cache, fall through to rebuild
        }
      }
    }

    // 1. Discover all JIDs from the per-tenant index (no global SCAN)
    const jids = await this.index.listJids(instancia);

    // 2. Build ConversationListItem for each JID in parallel
    const conversations = await Promise.all(
      jids.map((jid) => this.repo.buildListItem(instancia, jid)),
    );

    // 3. Sort by lastActivity descending
    const sorted = conversations.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
    );

    // 4. Cache unfiltered result (TTL 30s)
    if (!hasFilters) {
      await this.redis.set(
        RedisKeys.cacheConversations(instancia),
        JSON.stringify(sorted),
        'EX',
        30,
      );
    }

    // 5. Apply filters (after caching the full list)
    let result = sorted;

    if (filters.stage) {
      result = result.filter((c) => c.stage === filters.stage);
    }

    if (filters.aiState) {
      result = result.filter((c) => c.aiState === filters.aiState);
    }

    if (filters.search) {
      const term = filters.search.toLowerCase();
      result = result.filter(
        (c) =>
          c.contactName?.toLowerCase().includes(term) ||
          c.jid.toLowerCase().includes(term),
      );
    }

    return result;
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
    return { message: 'Tag adicionada' };
  }

  async removeTag(instancia: string, jid: string, tag: string): Promise<{ message: string }> {
    await this.repo.removeTag(instancia, jid, tag);
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
    await this.redis.del(RedisKeys.cacheConversations(instancia));

    this.logger.log(`Message sent + persisted for ${instancia}/${jid}`);
    return { message: 'Mensagem enviada' };
  }

  /**
   * Update the funnel stage (followup_step) for a conversation.
   */
  async updateStage(instancia: string, jid: string, stage: string): Promise<{ message: string; stage: string }> {
    const key = RedisKeys.followupStep(instancia, jid);
    await this.redis.set(key, stage);

    await this.publisher.publish({
      type: 'funnel.changed',
      instancia,
      jid,
      ts: Date.now(),
      payload: { stage },
    });

    this.logger.log(`Stage updated to ${stage} for ${instancia}/${jid}`);
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
