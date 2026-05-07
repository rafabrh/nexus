import { Injectable, Logger } from '@nestjs/common';
import type { Lead } from '@nexus/shared';
import { SheetsClient } from './sheets.client';
import type { LeadRow } from './sheets.client';
import type { FunnelStageKey } from '@nexus/shared';

@Injectable()
export class LeadService {
  private readonly logger = new Logger(LeadService.name);

  constructor(private readonly sheets: SheetsClient) {}

  async getLeads(instancia: string): Promise<Lead[]> {
    const rows = await this.sheets.getLeads(instancia);
    return rows.map((row) => this.toLead(row));
  }

  private toLead(row: LeadRow): Lead {
    return {
      leadId: row.leadId,
      name: row.name,
      phone: row.phone,
      instancia: row.instancia,
      stage: row.stage as FunnelStageKey,
      status: row.status as Lead['status'],
      origem: row.origem,
      firstContact: row.firstContact,
      lastContact: row.lastContact,
      totalInteractions: row.totalInteractions,
      valorPago: row.valorPago,
      tags: row.tags,
      notes: row.notes,
      handoffCount: row.handoffCount,
    };
  }
}
