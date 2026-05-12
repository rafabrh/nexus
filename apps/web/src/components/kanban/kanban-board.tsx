'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { KanbanCard } from './kanban-card';
import { useLeads } from '@/hooks/use-leads';
import { FunnelStage, type FunnelStageKey, type Lead } from '@nexus/shared';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

function ColumnSkeleton() {
  return (
    <div className="w-[260px] flex-shrink-0 bg-bg-surface rounded-card border border-border">
      <div className="p-3 border-b border-border">
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
      // Use jid from leadId to update stage
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
      <div className="flex gap-3 overflow-x-auto p-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <ColumnSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto p-4 h-full">
      {stages.map((stage) => {
        const stageLeads = leadsByStage[stage.key];
        const isOver = dragOverStage === stage.key;

        return (
          <div
            key={stage.key}
            className={cn(
              'w-[260px] flex-shrink-0 bg-bg-surface rounded-card border flex flex-col',
              isOver ? 'border-primary-600' : 'border-border',
            )}
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
            <div className="p-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="text-sm font-medium text-text-primary">
                  {stage.label}
                </span>
              </div>
              <span className="text-xs text-text-muted bg-bg-hover px-1.5 py-0.5 rounded-badge">
                {stageLeads.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {stageLeads.length === 0 && (
                <div className="py-8 text-center text-xs text-text-muted">
                  Nenhum lead
                </div>
              )}
              {stageLeads.map((lead) => (
                <KanbanCard
                  key={lead.leadId}
                  lead={lead}
                  onDragStart={() => setDraggedLead(lead)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
