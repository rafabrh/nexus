import { Injectable, Logger, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../core/redis/redis.module';
import { RedisKeys } from '@nexus/shared';
import type { DashboardData } from '@nexus/shared';
import { ConversationProjectionService } from '../conversation/conversation-projection.service';
import { SheetsClient } from '../lead/sheets.client';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly projection: ConversationProjectionService,
    private readonly sheets: SheetsClient,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getDashboard(instancia: string): Promise<DashboardData> {
    // Cache-aside: check for cached result (60s TTL)
    const cacheKey = RedisKeys.cacheDashboard(instancia);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as DashboardData;
      } catch {
        // Corrupted cache, fall through to rebuild
      }
    }

    const [activeCount, leadsData] = await Promise.all([
      this.projection.countActive(instancia), // count indexado no Postgres (era SCAN global)
      this.sheets.getLeadsForDashboard(instancia),
    ]);

    const data: DashboardData = {
      ts: new Date().toISOString(),
      period: 'today',
      leadsNew: leadsData.newToday,
      leadsActive: activeCount,
      leadsQualified: leadsData.qualified,
      leadsPaid: leadsData.paid,
      revenueToday: leadsData.revenueToday,
      revenueCurrency: 'BRL',
      avgResponseMs: 2300,
      handoffCount: leadsData.handoffsToday,
      conversionRate: leadsData.conversionRate,
      topStage: leadsData.topStage,
    };

    await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 60);

    return data;
  }
}
