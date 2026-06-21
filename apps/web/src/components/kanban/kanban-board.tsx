'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Inbox } from 'lucide-react';
import { KanbanCard } from './kanban-card';
import { useConversations } from '@/hooks/use-conversations';
import { FunnelStage, type FunnelStageKey, type ConversationListItem } from '@nexus/shared';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { cardEntrance, staggerContainer } from '@/lib/motion-variants';

function ColumnSkeleton() {
  return (
    <div
      className="w-[260px] flex-shrink-0 rounded-xl flex flex-col"
      style={{
        height: '100%',
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
  const { data: conversations, isLoading } = useConversations();
  const qc = useQueryClient();
  const stages = FunnelStage.all();
  const [draggedConv, setDraggedConv] = useState<ConversationListItem | null>(null);
  const [dragOverStage, setDragOverStage] = useState<FunnelStageKey | null>(null);

  const convByStage = useMemo(() => {
    const map: Record<FunnelStageKey, ConversationListItem[]> = {
      S0: [], S1: [], S2: [], S3: [], S4: [], S5: [], S6: [],
    };
    conversations?.forEach((c) => {
      if (map[c.stage]) map[c.stage].push(c);
    });
    return map;
  }, [conversations]);

  const handleDrop = async (stage: FunnelStageKey) => {
    const conv = draggedConv;
    setDraggedConv(null);
    setDragOverStage(null);
    if (!conv || conv.stage === stage) return;

    const label = conv.contactName || conv.phoneDisplay;

    // Optimistic: move the card immediately, reconcile/revert on the response.
    qc.setQueryData<ConversationListItem[]>(['conversations'], (old) =>
      old?.map((c) => (c.jid === conv.jid ? { ...c, stage } : c)),
    );

    try {
      // The stage is keyed by the conversation's canonical JID — use it directly.
      await api(`/api/v1/conversations/${encodeURIComponent(conv.jid)}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage }),
      });
      toast.success(`${label} movido para ${FunnelStage.fromString(stage).label}`);
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    } catch {
      toast.error('Erro ao mover');
      qc.invalidateQueries({ queryKey: ['conversations'] }); // revert optimistic
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
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
        <div className="flex gap-3 overflow-x-auto p-5 flex-1 min-h-0">
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
          Arraste os contatos entre as etapas para atualizar o estágio
        </p>
      </div>

      {/* Board scroll container — columns fill the available height */}
      <div
        className="flex gap-3 overflow-x-auto p-5 flex-1 min-h-0 items-stretch"
        style={{ scrollSnapType: 'x proximity', scrollPadding: '20px' }}
      >
        {stages.map((stage) => {
          const stageConvs = convByStage[stage.key];
          const isOver = dragOverStage === stage.key;

          return (
            <div
              key={stage.key}
              className="w-[260px] flex-shrink-0 rounded-xl flex flex-col"
              style={{
                height: '100%',
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
              <div className="px-3 pt-3 pb-2 flex-shrink-0">
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
                    {stageConvs.length}
                  </span>
                </div>
                <div
                  className="w-full rounded-full"
                  style={{ height: 2, background: stage.color, opacity: 0.3 }}
                />
              </div>

              {/* Cards area — this is what scrolls */}
              <motion.div
                className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 p-2"
                variants={staggerContainer}
                initial="initial"
                animate="animate"
              >
                {stageConvs.length === 0 && (
                  <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
                    <Inbox size={20} className="text-text-muted/50 mb-2" />
                    <span className="text-xs text-text-muted">Nenhum contato</span>
                  </div>
                )}
                {stageConvs.map((conv, index) => (
                  <motion.div
                    key={conv.jid}
                    variants={cardEntrance}
                    custom={index}
                    transition={{ delay: index * 0.03 }}
                  >
                    <KanbanCard
                      conv={conv}
                      onDragStart={() => setDraggedConv(conv)}
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
