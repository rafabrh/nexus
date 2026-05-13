'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { KanbanCard } from './kanban-card';
import { useLeads } from '@/hooks/use-leads';
import { FunnelStage, type FunnelStageKey, type Lead } from '@nexus/shared';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { cardEntrance, staggerContainer } from '@/lib/motion-variants';

function ColumnSkeleton() {
  return (
    <div
      className="w-[260px] flex-shrink-0 rounded-xl flex flex-col"
      style={{
        background: 'rgba(20,24,32,0.6)',
        backdropFilter: 'blur(8px) saturate(1.1)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="p-3 border-b border-white/[0.04]">
        <div className="h-4 w-24 skeleton" />
      </div>
      <div className="p-2 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 skeleton" />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard() {
  const { data: leads, isLoading } = useLeads();
  const qc = useQueryClient();
  const stages = FunnelStage.all();
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<FunnelStageKey | null>(null);

  const leadsByStage = useMemo(() => {
    const map: Record<FunnelStageKey, Lead[]> = {
      S0: [], S1: [], S2: [], S3: [], S4: [], S5: [], S6: [],
    };
    if (leads) {
      leads.forEach((l) => {
        if (map[l.stage]) {
          map[l.stage].push(l);
        }
      });
    }
    return map;
  }, [leads]);

  const handleDrop = async (stage: FunnelStageKey) => {
    if (!draggedLead || draggedLead.stage === stage) {
      setDraggedLead(null);
      setDragOverStage(null);
      return;
    }

    try {
      await api(`/api/v1/conversations/${encodeURIComponent(draggedLead.leadId)}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage }),
      });
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast.success(`${draggedLead.name} movido para ${FunnelStage.fromString(stage).label}`);
    } catch {
      toast.error('Erro ao mover lead');
    }

    setDraggedLead(null);
    setDragOverStage(null);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        {/* Glass header skeleton */}
        <div
          className="flex-shrink-0 px-5 py-4"
          style={{
            background: 'rgba(20,24,32,0.72)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <div className="h-5 w-36 skeleton mb-1" />
          <div className="h-3 w-52 skeleton" />
        </div>
        <div
          className="flex gap-3 overflow-x-auto p-5 flex-1"
          style={{ scrollSnapType: 'x proximity', scrollPadding: '20px' }}
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <ColumnSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Glass header */}
      <div
        className="flex-shrink-0 px-5 py-4"
        style={{
          background: 'rgba(20,24,32,0.72)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <h1
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            fontSize: '20px',
            color: 'rgba(255,255,255,0.92)',
            lineHeight: 1.2,
          }}
        >
          Funil de Vendas
        </h1>
        <p className="text-xs text-text-muted mt-0.5">
          Arraste os leads entre as etapas para atualizar o estágio
        </p>
      </div>

      {/* Board scroll container */}
      <div
        className="flex gap-3 overflow-x-auto p-5 flex-1 items-start"
        style={{ scrollSnapType: 'x proximity', scrollPadding: '20px' }}
      >
        {stages.map((stage) => {
          const stageLeads = leadsByStage[stage.key];
          const isOver = dragOverStage === stage.key;

          return (
            <div
              key={stage.key}
              className="w-[260px] flex-shrink-0 rounded-xl flex flex-col"
              style={{
                scrollSnapAlign: 'start',
                background: isOver
                  ? `color-mix(in srgb, ${stage.color} 3%, rgba(20,24,32,0.6))`
                  : 'rgba(20,24,32,0.6)',
                backdropFilter: 'blur(8px) saturate(1.1)',
                border: isOver
                  ? `1px solid ${stage.color}66`
                  : '1px solid rgba(255,255,255,0.06)',
                boxShadow: isOver
                  ? `0 0 0 1px ${stage.color}29, 0 4px 24px ${stage.color}18`
                  : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.key);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(stage.key);
              }}
            >
              {/* Column header */}
              <div className="px-3 pt-3 pb-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full flex-shrink-0"
                      style={{
                        width: 10,
                        height: 10,
                        backgroundColor: stage.color,
                        boxShadow: `0 0 0 2px ${stage.color}4D`,
                      }}
                    />
                    <span className="text-sm font-medium text-text-primary">
                      {stage.label}
                    </span>
                  </div>
                  <span
                    className="text-xs font-medium text-text-muted rounded-full px-2 py-0.5 tabular-nums"
                    style={{ background: '#0C0F12' }}
                  >
                    {stageLeads.length}
                  </span>
                </div>
                {/* Stage color line */}
                <div
                  className="w-full rounded-full"
                  style={{
                    height: 2,
                    background: stage.color,
                    opacity: 0.3,
                  }}
                />
              </div>

              {/* Cards area */}
              <motion.div
                className="flex-1 overflow-y-auto flex flex-col gap-2 p-2"
                variants={staggerContainer}
                initial="initial"
                animate="animate"
              >
                {stageLeads.length === 0 && (
                  <div className="py-8 text-center text-xs text-text-muted">
                    Nenhum lead
                  </div>
                )}
                {stageLeads.map((lead, index) => (
                  <motion.div
                    key={lead.leadId}
                    variants={cardEntrance}
                    custom={index}
                    transition={{ delay: index * 0.03 }}
                  >
                    <KanbanCard
                      lead={lead}
                      onDragStart={() => setDraggedLead(lead)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
