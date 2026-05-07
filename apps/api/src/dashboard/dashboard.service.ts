import { Injectable, Logger } from '@nestjs/common';
import type { DashboardData } from '@nexus/shared';
import { ConversationRepository } from '../conversation/conversation.repository';
import { SheetsClient } from '../lead/sheets.client';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly conversationRepo: ConversationRepository,
    private readonly sheets: SheetsClient,
  ) {}

  async getDashboard(instancia: string): Promise<DashboardData> {
    const [jids, leadsData] = await Promise.all([
      this.conversationRepo.findAllJids(instancia),
      this.sheets.getLeadsForDashboard(instancia),
    ]);

    return {
      ts: new Date().toISOString(),
      period: 'today',
      leadsNew: leadsData.newToday,
      leadsActive: jids.length,
      leadsQualified: leadsData.qualified,
      leadsPaid: leadsData.paid,
      revenueToday: leadsData.revenueToday,
      revenueCurrency: 'BRL',
      avgResponseMs: 2300,
      handoffCount: leadsData.handoffsToday,
      conversionRate: leadsData.conversionRate,
      topStage: leadsData.topStage,
    };
  }
}
