export interface DashboardData {
  ts: string;
  period: string;
  leadsNew: number;
  leadsActive: number;
  leadsQualified: number;
  leadsPaid: number;
  revenueToday: number;
  revenueCurrency: string;
  avgResponseMs: number;
  handoffCount: number;
  conversionRate: number;
  topStage: string;
}
