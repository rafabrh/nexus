'use client';

import { Users, DollarSign, TrendingUp, Zap } from 'lucide-react';
import { KpiCard, KpiCardSkeleton } from '@/components/dashboard/kpi-card';
import { FunnelChart } from '@/components/dashboard/funnel-chart';
import { ActivityList } from '@/components/dashboard/activity-list';
import { SalesTable } from '@/components/dashboard/sales-table';
import { useDashboard } from '@/hooks/use-dashboard';
import { formatCurrency } from '@/lib/utils';

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              icon={Users}
              label="Leads ativos"
              value={data.leadsActive}
              subtitle={`${data.leadsNew} novos hoje`}
              accentColor="#3B82F6"
            />
            <KpiCard
              icon={DollarSign}
              label="Receita hoje"
              value={formatCurrency(data.revenueToday)}
              subtitle={`${data.leadsPaid} vendas`}
              accentColor="#22C55E"
            />
            <KpiCard
              icon={TrendingUp}
              label="Conversao"
              value={`${data.conversionRate}%`}
              subtitle={`${data.leadsQualified} qualificados`}
              accentColor="#14B8A6"
            />
            <KpiCard
              icon={Zap}
              label="Resp. media"
              value={`${(data.avgResponseMs / 1000).toFixed(1)}s`}
              subtitle={`${data.handoffCount} handoffs`}
              accentColor="#F59E0B"
            />
          </>
        )}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column */}
        <div className="lg:col-span-7 space-y-6">
          <FunnelChart />
          <SalesTable />
        </div>

        {/* Right column */}
        <div className="lg:col-span-5">
          <ActivityList />
        </div>
      </div>
    </div>
  );
}
