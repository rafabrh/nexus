'use client';

import { useRef, useEffect, useMemo } from 'react';
import { gsap } from 'gsap';
import { BarChart3 } from 'lucide-react';
import { useConversations } from '@/hooks/use-conversations';
import { FunnelStage } from '@nexus/shared';

const glassStyle: React.CSSProperties = {
  background: 'rgba(20,24,32,0.72)',
  backdropFilter: 'blur(12px) saturate(1.2)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '12px',
  padding: '16px',
};

export function FunnelChart() {
  const { data: conversations, isLoading } = useConversations();
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const countRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const { stageData, total } = useMemo(() => {
    const stages = FunnelStage.all();
    const counts: Record<string, number> = {};
    conversations?.forEach((c) => {
      counts[c.stage] = (counts[c.stage] || 0) + 1;
    });
    const tot = conversations?.length ?? 0;
    const max = Math.max(...stages.map((s) => counts[s.key] || 0), 1);
    return {
      total: tot,
      stageData: stages.map((s, i) => {
        const count = counts[s.key] || 0;
        const prevCount = i > 0 ? counts[stages[i - 1].key] || 0 : count;
        const dropoff = i > 0 && prevCount > 0 ? Math.round((1 - count / prevCount) * 100) : null;
        return {
          ...s,
          count,
          widthPct: (count / max) * 100,
          totalPct: tot > 0 ? Math.round((count / tot) * 100) : 0,
          dropoff,
        };
      }),
    };
  }, [conversations]);

  useEffect(() => {
    if (isLoading || stageData.length === 0) return;

    barRefs.current.forEach((bar, i) => {
      if (!bar) return;
      gsap.fromTo(
        bar,
        { width: '0%', opacity: 0.4 },
        {
          width: `${stageData[i]?.widthPct ?? 0}%`,
          opacity: 1,
          duration: 0.9,
          delay: i * 0.08,
          ease: 'power3.out',
        },
      );
    });

    // Count-up numbers in sync with the bars.
    countRefs.current.forEach((el, i) => {
      if (!el) return;
      const target = stageData[i]?.count ?? 0;
      const obj = { v: 0 };
      gsap.to(obj, {
        v: target,
        duration: 0.9,
        delay: i * 0.08,
        ease: 'power3.out',
        onUpdate: () => {
          el.textContent = String(Math.round(obj.v));
        },
      });
    });
  }, [isLoading, stageData]);

  if (isLoading) {
    return (
      <div style={glassStyle}>
        <div className="h-4 w-32 skeleton mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-7 skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={glassStyle}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={15} className="text-primary-400" />
          <h3 className="text-sm font-medium text-text-secondary">Funil de Vendas</h3>
        </div>
        <span className="text-xs text-text-muted tabular-nums">
          {total} {total === 1 ? 'contato' : 'contatos'}
        </span>
      </div>

      <div className="space-y-2">
        {stageData.map((stage, i) => (
          <div key={stage.key} className="group">
            <div className="flex items-center gap-3">
              {/* Label */}
              <div className="flex items-center gap-2 w-28 flex-shrink-0">
                <span
                  className="rounded-full flex-shrink-0"
                  style={{
                    width: 7,
                    height: 7,
                    backgroundColor: stage.color,
                    boxShadow: `0 0 6px ${stage.color}aa`,
                  }}
                />
                <span className="text-xs text-text-secondary truncate">{stage.label}</span>
              </div>

              {/* Bar track */}
              <div
                className="flex-1 h-7 rounded-md overflow-hidden relative"
                style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.03)' }}
              >
                <div
                  ref={(el) => { barRefs.current[i] = el; }}
                  className="h-full rounded-md relative transition-[filter,box-shadow] duration-200 group-hover:brightness-110"
                  style={{
                    width: '0%',
                    minWidth: stage.count > 0 ? 6 : 0,
                    background: `linear-gradient(90deg, ${stage.color}cc, ${stage.color}66)`,
                    boxShadow: `inset 0 0 0 1px ${stage.color}40`,
                  }}
                >
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-md"
                    style={{ boxShadow: `0 0 14px 1px ${stage.color}88` }}
                  />
                </div>
              </div>

              {/* Count + share */}
              <div className="flex items-baseline gap-1.5 w-16 justify-end flex-shrink-0">
                <span
                  ref={(el) => { countRefs.current[i] = el; }}
                  className="text-sm font-semibold text-text-primary tabular-nums"
                >
                  0
                </span>
                <span className="text-[10px] text-text-muted tabular-nums">{stage.totalPct}%</span>
              </div>
            </div>

            {/* Drop-off between stages */}
            {stage.dropoff !== null && stage.dropoff > 0 && (
              <div className="flex items-center pl-[124px] mt-0.5 mb-0.5">
                <span className="text-[9px] text-text-muted/70 tabular-nums">
                  ↓ {stage.dropoff}% drop-off
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
