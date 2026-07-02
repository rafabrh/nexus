import { Injectable, Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type Redis from 'ioredis';
import { and, desc, eq, sql } from 'drizzle-orm';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { DB, type Database } from '../core/db/db.module';
import { conversations } from '../core/db/schema';
import { RedisKeys, FunnelStage, PhoneMask } from '@nexus/shared';
import type { ConversationListItem, AiState } from '@nexus/shared';
import type { ConversationRow } from '../core/db/schema';
import { ConversationRepository } from './conversation.repository';
import { ConversationIndexService } from './conversation-index.service';
import { TenantRepository } from '../admin/tenant.repository';

/**
 * Projeção durável (write-behind) do estado de conversa que vive no Redis/N8N.
 * O Redis continua sendo o contrato com o N8N; esta tabela é a cópia consultável
 * e indexada que alimenta a LISTA e o COUNT do dashboard sem fan-out de N chaves.
 *
 * Direção do dado: N8N → Redis → (KeyspaceListener) → project() → Postgres → painel.
 * A leitura de estado do Redis é single-sourced via ConversationRepository.buildListItem.
 */
@Injectable()
export class ConversationProjectionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConversationProjectionService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly repo: ConversationRepository,
    private readonly index: ConversationIndexService,
    private readonly tenants: TenantRepository,
  ) {}

  /** Reprojeta uma conversa a partir do estado atual no Redis. Idempotente. */
  async project(instancia: string, jid: string): Promise<void> {
    if (!instancia || !jid) return;
    const item = await this.repo.buildListItem(instancia, jid);
    const phone = jid.replace('@s.whatsapp.net', '');
    const humanControlUntil = item.aiOffUntil ? new Date(item.aiOffUntil) : null;

    const row = {
      instancia,
      jid,
      phone,
      contactName: item.contactName,
      stage: item.stage,
      paymentStatus: item.paymentStatus,
      isHot: item.isHot,
      optout: item.optout,
      tags: item.tags,
      humanControlUntil,
      lastMessagePreview: item.lastMessagePreview,
      lastActivity: item.lastActivity ? new Date(item.lastActivity) : null,
      updatedAt: new Date(),
    };

    await this.db
      .insert(conversations)
      .values(row)
      .onConflictDoUpdate({
        target: [conversations.instancia, conversations.jid],
        set: {
          contactName: row.contactName,
          stage: row.stage,
          paymentStatus: row.paymentStatus,
          isHot: row.isHot,
          optout: row.optout,
          tags: row.tags,
          humanControlUntil: row.humanControlUntil,
          lastMessagePreview: row.lastMessagePreview,
          lastActivity: row.lastActivity,
          updatedAt: row.updatedAt,
        },
      });
  }

  /** Lista as conversas do tenant a partir do Postgres (indexado, sem fan-out). */
  async list(
    instancia: string,
    filters: { stage?: string; search?: string; aiState?: string },
  ): Promise<ConversationListItem[]> {
    const conds = [eq(conversations.instancia, instancia)];
    if (filters.stage) conds.push(eq(conversations.stage, filters.stage));

    const rows = await this.db
      .select()
      .from(conversations)
      .where(and(...conds))
      .orderBy(desc(conversations.lastActivity));

    let items = rows.map((r) => this.toListItem(r));

    // aiState é recomputado na leitura (depende do tempo) → filtra em memória.
    if (filters.aiState) {
      items = items.filter((c) => c.aiState === filters.aiState);
    }
    if (filters.search) {
      const term = filters.search.toLowerCase();
      items = items.filter(
        (c) => c.contactName?.toLowerCase().includes(term) || c.jid.toLowerCase().includes(term),
      );
    }
    return items;
  }

  /** Conta conversas do tenant (substitui o SCAN chat:{inst}:*:followup_step). */
  async countActive(instancia: string): Promise<number> {
    const [res] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(conversations)
      .where(eq(conversations.instancia, instancia));
    return res?.count ?? 0;
  }

  private toListItem(row: ConversationRow): ConversationListItem {
    const funnelStage = FunnelStage.fromString(row.stage);
    const aiState = this.resolveAiState(row.humanControlUntil);
    return {
      jid: row.jid,
      contactName: row.contactName || PhoneMask.reveal(row.jid),
      phoneDisplay: PhoneMask.reveal(row.jid),
      aiState: aiState.state,
      aiOffUntil: aiState.until,
      stage: funnelStage.key,
      stageLabel: funnelStage.label,
      stageColor: funnelStage.color,
      stageProgress: funnelStage.progress,
      paymentStatus: row.paymentStatus,
      optout: row.optout,
      tags: row.tags ?? [],
      lastMessagePreview: row.lastMessagePreview ?? '',
      lastActivity: (row.lastActivity ?? row.updatedAt).toISOString(),
      isHot: row.isHot,
    };
  }

  private resolveAiState(until: Date | null): { state: AiState; until: string | null } {
    if (!until || until.getTime() <= Date.now()) {
      return { state: 'ON', until: null };
    }
    return { state: 'OFF_UNTIL', until: until.toISOString() };
  }

  /**
   * Backfill one-time: popula a projeção a partir do índice Redis para cada tenant
   * cuja projeção ainda está vazia. Idempotente (onConflictDoUpdate).
   *
   * Esta é a ÚNICA orquestração de backfill no boot: garante primeiro que o índice
   * Redis exista (index.backfillIfEmpty) e só então projeta a partir dele — a
   * direção de dependência correta (a projeção consome o índice). Elimina a race
   * de ordenação onde índice e projeção tinham bootstraps independentes e a
   * projeção podia rodar antes do índice estar populado, deixando a lista/dashboard
   * vazios após o cutover.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const tenants = await this.tenants.list();
      for (const { instancia } of tenants) {
        // 1) Garante o índice de descoberta no Redis ANTES de ler dele.
        await this.index
          .backfillIfEmpty(instancia)
          .catch((err: Error) =>
            this.logger.warn(`index-backfill failed instancia=${instancia}: ${err.message}`),
          );
        // 2) Projeta no Postgres apenas se a projeção do tenant ainda estiver vazia.
        if ((await this.countActive(instancia)) > 0) continue;
        const jids = await this.redis.smembers(RedisKeys.conversationIndex(instancia));
        if (jids.length === 0) continue;
        for (const jid of jids) {
          await this.project(instancia, jid).catch(() => {});
        }
        this.logger.log(`projection-backfill instancia=${instancia} count=${jids.length}`);
      }
    } catch (err) {
      this.logger.warn(`projection-backfill failed: ${(err as Error).message}`);
    }
  }
}
