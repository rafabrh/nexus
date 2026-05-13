import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';
import { sheetsPolicy } from '../core/resilience/policies';
import * as fs from 'node:fs';

export interface LeadRow {
  leadId: string;
  name: string;
  phone: string;
  instancia: string;
  stage: string;
  status: string;
  origem: string;
  firstContact: string;
  lastContact: string;
  totalInteractions: number;
  valorPago: number;
  tags: string[];
  notes: string;
  handoffCount: number;
}

export interface DashboardLeadsData {
  newToday: number;
  qualified: number;
  paid: number;
  revenueToday: number;
  handoffsToday: number;
  conversionRate: number;
  topStage: string;
}

@Injectable()
export class SheetsClient {
  private sheets: sheets_v4.Sheets | null = null;
  private readonly docId: string;
  private readonly logger = new Logger(SheetsClient.name);

  constructor(private readonly config: ConfigService) {
    this.docId = config.get<string>('SHEETS_DOCUMENT_ID', '');

    const saJson = config.get<string>('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (saJson) {
      try {
        const raw = saJson.startsWith('{') ? saJson : fs.readFileSync(saJson, 'utf8');
        const credentials = JSON.parse(raw);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        this.sheets = google.sheets({ version: 'v4', auth });
      } catch (err) {
        this.logger.warn(`Google Sheets initialization failed: ${(err as Error).message}`);
      }
    } else {
      this.logger.warn('GOOGLE_SERVICE_ACCOUNT_JSON not configured — Sheets client disabled');
    }
  }

  async getLeads(instancia: string): Promise<LeadRow[]> {
    if (!this.sheets || !this.docId) {
      this.logger.warn('Sheets client not initialized or no document ID, returning empty leads');
      return [];
    }

    return sheetsPolicy.execute(async () => {
      const res = await this.sheets!.spreadsheets.values.get({
        spreadsheetId: this.docId,
        range: 'Leads!A2:O',
      });

      const rows = res.data.values ?? [];
      return rows
        .filter((row) => row[3] === instancia)
        .map((row) => ({
          leadId: row[0] ?? '',
          name: row[1] ?? '',
          phone: row[2] ?? '',
          instancia: row[3] ?? '',
          stage: row[4] ?? 'S0',
          status: row[5] ?? 'ativo',
          origem: row[6] ?? '',
          firstContact: row[7] ?? '',
          lastContact: row[8] ?? '',
          totalInteractions: parseInt(row[9] ?? '0', 10),
          valorPago: parseFloat(row[10] ?? '0'),
          tags: row[11] ? this.safeParseArray(row[11]) : [],
          notes: row[12] ?? '',
          handoffCount: parseInt(row[13] ?? '0', 10),
        }));
    });
  }

  async getLeadsForDashboard(instancia: string): Promise<DashboardLeadsData> {
    const leads = await this.getLeads(instancia);
    const today = new Date().toISOString().split('T')[0];

    return {
      newToday: leads.filter((l) => l.firstContact?.startsWith(today)).length,
      qualified: leads.filter((l) => ['S4', 'S5', 'S6'].includes(l.stage)).length,
      paid: leads.filter((l) => l.status === 'pago').length,
      revenueToday: leads
        .filter((l) => l.status === 'pago')
        .reduce((sum, l) => sum + l.valorPago, 0),
      handoffsToday: 0,
      conversionRate:
        leads.length > 0
          ? leads.filter((l) => l.status === 'pago').length / leads.length
          : 0,
      topStage: this.getMostCommonStage(leads),
    };
  }

  private getMostCommonStage(leads: LeadRow[]): string {
    const counts: Record<string, number> = {};
    for (const l of leads) {
      counts[l.stage] = (counts[l.stage] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? 'S0';
  }

  private safeParseArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
