'use client';

import { useRef, useEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import { useConversations } from '@/hooks/use-conversations';
import { FunnelStage, type FunnelStageKey } from '@nexus/shared';

export function FunnelChart() {
  const { data: conversations, isLoading } = useConversations();
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);

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

  useEffect(() => {
    if (isLoading || stageData.length === 0) return;

    barRefs.current.forEach((bar, i) => {
      if (!bar) return;
      gsap.fromTo(
        bar,
        { width: '0%' },
        {
          width: `${stageData[i]?.percentage ?? 0}%`,
          duration: 0.8,
          delay: i * 0.08,
          ease: 'power2.out',
        },
      );
    });
  }, [isLoading, stageData]);

  const glassStyle: React.CSSProperties = {
    background: 'rgba(20,24,32,0.72)',
    backdropFilter: 'blur(12px) saturate(1.2)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: '16px',
  };

  if (isLoading) {
    return (
      <div style={glassStyle}>
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
    <div style={glassStyle}>
      <h3 className="text-sm font-medium text-text-secondary mb-4">Funil de Vendas</h3>
      <div className="space-y-2.5">
        {stageData.map((stage, i) => (
          <div key={stage.key} className="flex items-center gap-3">
            <span className="text-xs text-text-muted w-28 truncate">{stage.label}</span>
            <div
              className="flex-1 h-5 overflow-hidden"
              style={{
                background: '#0C0F12',
                border: '1px solid rgba(255,255,255,0.03)',
                borderRadius: '4px',
              }}
            >
              <div
                ref={(el) => { barRefs.current[i] = el; }}
                className="h-full"
                style={{
                  width: '0%',
                  backgroundColor: stage.color,
                  borderRadius: '4px',
                  minWidth: stage.count > 0 ? '8px' : '0',
                  transition: 'filter 0.2s ease, box-shadow 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.filter = 'brightness(1.2)';
                  el.style.boxShadow = `0 0 8px 2px ${stage.color}55`;
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.filter = 'brightness(1)';
                  el.style.boxShadow = 'none';
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
