'use client';

import { cn } from '@/lib/utils';
import { useConversations } from '@/hooks/use-conversations';
import { FunnelStage, type FunnelStageKey } from '@nexus/shared';
import { useMemo } from 'react';

export function FunnelChart() {
  const { data: conversations, isLoading } = useConversations();

  const stageData = useMemo(() => {
    const stages = FunnelStage.all();
    const counts: Record<string, number> = {};
    conversations?.forEach((c) => {
      counts[c.stage] = (counts[c.stage] || 0) + 1;
    });
    const max = Math.max(...Object.values(counts), 1);
    return stages.map((s) => ({
      ...s,
      count: counts[s.key] || 0,
      percentage: ((counts[s.key] || 0) / max) * 100,
    }));
  }, [conversations]);

  if (isLoading) {
    return (
      <div className="bg-bg-surface border border-border rounded-card p-4">
        <div className="h-4 w-24 skeleton mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-6 skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-surface border border-border rounded-card p-4">
      <h3 className="text-sm font-medium text-text-secondary mb-4">
        Funil de Vendas
      </h3>
      <div className="space-y-2.5">
        {stageData.map((stage) => (
          <div key={stage.key} className="flex items-center gap-3">
            <span className="text-xs text-text-muted w-28 truncate">
              {stage.label}
            </span>
            <div className="flex-1 h-5 bg-bg-elevated rounded-badge overflow-hidden">
              <div
                className="h-full rounded-badge transition-all duration-250"
                style={{
                  width: `${stage.percentage}%`,
                  backgroundColor: stage.color,
                  minWidth: stage.count > 0 ? '8px' : '0',
                }}
              />
            </div>
            <span className="text-xs text-text-primary font-medium w-6 text-right">
              {stage.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
