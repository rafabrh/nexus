'use client';

import { motion } from 'framer-motion';
import { Users, DollarSign, TrendingUp, Zap } from 'lucide-react';
import { KpiCard, KpiCardSkeleton } from '@/components/dashboard/kpi-card';
import { FunnelChart } from '@/components/dashboard/funnel-chart';
import { ActivityList } from '@/components/dashboard/activity-list';
import { SalesTable } from '@/components/dashboard/sales-table';
import { useDashboard } from '@/hooks/use-dashboard';
import { formatCurrency } from '@/lib/utils';
import { LenisProvider } from '@/providers/lenis-provider';
import {
  pageTransition,
  pageTransitionConfig,
  staggerContainer,
  cardEntrance,
} from '@/lib/motion-variants';

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();

  return (
    <LenisProvider>
      <motion.div
        className="p-6 max-w-[1400px] mx-auto"
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={pageTransitionConfig}
      >
        {/* Header */}
        <div className="mb-6">
          <h1
            className="text-text-primary"
            style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '24px' }}
          >
            Dashboard
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">Metricas em tempo real</p>
        </div>

        {/* KPI Grid */}
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {isLoading || !data ? (
            Array.from({ length: 4 }).map((_, i) => (
              <motion.div key={i} variants={cardEntrance}>
                <KpiCardSkeleton />
              </motion.div>
            ))
          ) : (
            <>
              <motion.div variants={cardEntrance}>
                <KpiCard
                  icon={Users}
                  label="Leads ativos"
                  value={data.leadsActive}
                  subtitle={`${data.leadsNew} novos hoje`}
                  accentColor="#3B82F6"
                />
              </motion.div>
              <motion.div variants={cardEntrance}>
                <KpiCard
                  icon={DollarSign}
                  label="Receita hoje"
                  value={formatCurrency(data.revenueToday)}
                  subtitle={`${data.leadsPaid} vendas`}
                  accentColor="#22C55E"
                />
              </motion.div>
              <motion.div variants={cardEntrance}>
                <KpiCard
                  icon={TrendingUp}
                  label="Conversao"
                  value={`${data.conversionRate}%`}
                  subtitle={`${data.leadsQualified} qualificados`}
                  accentColor="#14B8A6"
                />
              </motion.div>
              <motion.div variants={cardEntrance}>
                <KpiCard
                  icon={Zap}
                  label="Resp. media"
                  value={`${(data.avgResponseMs / 1000).toFixed(1)}s`}
                  subtitle={`${data.handoffCount} handoffs`}
                  accentColor="#F59E0B"
                />
              </motion.div>
            </>
          )}
        </motion.div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column */}
          <div
            className="lg:col-span-7 space-y-6"
            style={{
              background: 'rgba(20,24,32,0.72)',
              backdropFilter: 'blur(12px) saturate(1.2)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: '16px',
            }}
          >
            <FunnelChart />
            <SalesTable />
          </div>

          {/* Right column */}
          <div
            className="lg:col-span-5"
            style={{
              background: 'rgba(20,24,32,0.72)',
              backdropFilter: 'blur(12px) saturate(1.2)',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.06)',
              padding: '16px',
            }}
          >
            <ActivityList />
          </div>
        </div>
      </motion.div>
    </LenisProvider>
  );
}
