'use client';

import { motion } from 'framer-motion';
import { Users, DollarSign, TrendingUp, Zap } from 'lucide-react';
import { KpiCard, KpiCardSkeleton } from '@/components/dashboard/kpi-card';
import { FunnelChart } from '@/components/dashboard/funnel-chart';
import { ConversionGauge } from '@/components/dashboard/conversion-gauge';
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
                  accentColor="var(--info)"
                />
              </motion.div>
              <motion.div variants={cardEntrance}>
                <KpiCard
                  icon={DollarSign}
                  label="Receita hoje"
                  value={formatCurrency(data.revenueToday)}
                  subtitle={`${data.leadsPaid} vendas`}
                  accentColor="var(--success)"
                />
              </motion.div>
              <motion.div variants={cardEntrance}>
                <KpiCard
                  icon={TrendingUp}
                  label="Conversao"
                  value={`${data.conversionRate}%`}
                  subtitle={`${data.leadsQualified} qualificados`}
                  accentColor="var(--accent-500)"
                />
              </motion.div>
              <motion.div variants={cardEntrance}>
                <KpiCard
                  icon={Zap}
                  label="Resp. media"
                  value={`${(data.avgResponseMs / 1000).toFixed(1)}s`}
                  subtitle={`${data.handoffCount} handoffs`}
                  accentColor="var(--warning)"
                />
              </motion.div>
            </>
          )}
        </motion.div>

        {/* Content grid — each panel carries its own glass (no nesting) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-6">
            <FunnelChart />
            <SalesTable />
          </div>

          {/* Right column */}
          <div className="lg:col-span-4 space-y-6">
            <ConversionGauge
              value={data?.conversionRate ?? 0}
              subtitle={`${data?.leadsQualified ?? 0} qualificados`}
            />
            <ActivityList />
          </div>
        </div>
      </motion.div>
    </LenisProvider>
  );
}
