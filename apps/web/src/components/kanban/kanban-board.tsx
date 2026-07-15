'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  motion,
  AnimatePresence,
  Reorder,
  useDragControls,
  useReducedMotion,
  type DragControls,
} from 'framer-motion';
import { notify } from '@/lib/notify';
import { Inbox } from 'lucide-react';
import { KanbanCard } from './kanban-card';
import { ColumnHeader } from './column-header';
import { AddColumn } from './add-column';
import { useConversations } from '@/hooks/use-conversations';
import {
  useFunnelStages,
  useCreateStage,
  useUpdateStage as useUpdateFunnelStage,
  useDeleteStage,
  useReorderStages,
} from '@/hooks/use-funnel-stages';
import { isApiError } from '@/lib/api';
import type { ConversationListItem, FunnelStageDto } from '@nexus/shared';
import { stageColorToken } from '@/lib/stage-colors';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { cardEntrance, staggerContainer } from '@/lib/motion-variants';

function ColumnSkeleton() {
  return (
    <div
      className="w-[260px] flex-shrink-0 rounded-xl flex flex-col"
      style={{
        height: '100%',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="p-3 border-b" style={{ borderColor: 'var(--border-default)' }}>
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

/** Cor resolvida de uma coluna: `stage.color` (hex do backend) com fallback token. */
function resolveColor(stage: FunnelStageDto): string {
  return stage.color || stageColorToken(stage.key);
}

interface KanbanColumnProps {
  stage: FunnelStageDto;
  convs: ConversationListItem[];
  isOver: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onDragOverColumn: () => void;
  onDragLeaveColumn: () => void;
  onDropColumn: () => void;
  onCardDragStart: (conv: ConversationListItem) => void;
  onRename: (label: string) => void;
  onColorSelect: (hex: string) => void;
  onDelete: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}

/**
 * Uma coluna do Kanban dentro do Reorder.Group. Possui seus próprios dragControls
 * (a pega é o cabeçalho, via dragListener={false}), então mexer nos cards ou no
 * menu nunca dispara o arraste da coluna sem querer.
 */
function KanbanColumn({
  stage,
  convs,
  isOver,
  canMoveLeft,
  canMoveRight,
  onDragOverColumn,
  onDragLeaveColumn,
  onDropColumn,
  onCardDragStart,
  onRename,
  onColorSelect,
  onDelete,
  onMoveLeft,
  onMoveRight,
}: KanbanColumnProps) {
  const controls = useDragControls();
  const reduce = useReducedMotion();
  const color = resolveColor(stage);

  return (
    <Reorder.Item
      value={stage}
      as="div"
      // dragListener={false}: o arraste só começa pela pega do cabeçalho
      // (dragControls). No mobile a pega é escondida (`hidden md:flex`) e o
      // ColumnHeader ignora ponteiros de toque — scroll-snap manda; a
      // reordenação no toque vem dos itens "Mover ←/→" do menu ⋯.
      dragListener={false}
      dragControls={controls}
      drag="x"
      whileDrag={
        reduce
          ? { zIndex: 20 }
          : { scale: 1.02, boxShadow: 'var(--shadow-panel)', zIndex: 20 }
      }
      // Entrada da coluna nova: spring {360,26} (opacity + scale .94 + x-12).
      // Saída (exclusão): opacity + scale .94 + x-8 em .22s. Reduced motion → só
      // opacity. `layout` deixa o reorder animar a troca de posição.
      layout
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, x: -12 }}
      animate={
        reduce
          ? { opacity: 1 }
          : {
              opacity: 1,
              scale: 1,
              x: 0,
              transition: { type: 'spring', stiffness: 360, damping: 26 },
            }
      }
      exit={
        reduce
          ? { opacity: 0, transition: { duration: 0.22 } }
          : { opacity: 0, scale: 0.94, x: -8, transition: { duration: 0.22 } }
      }
      className="w-[260px] flex-shrink-0 rounded-xl flex flex-col group"
      style={{
        height: '100%',
        scrollSnapAlign: 'start',
        background: isOver
          ? `color-mix(in srgb, ${color} 6%, var(--bg-surface))`
          : 'var(--bg-surface)',
        border: isOver
          ? `1px solid color-mix(in srgb, ${color} 40%, var(--border-default))`
          : '1px solid var(--border-default)',
        boxShadow: isOver ? 'var(--shadow-panel)' : 'var(--shadow-control)',
        transition:
          'border-color var(--duration-fast), box-shadow var(--duration-fast), background var(--duration-fast)',
      }}
      onDragOver={(e: React.DragEvent) => {
        // Card DnD (HTML5) — mover card entre colunas. Distinto do drag de coluna.
        e.preventDefault();
        onDragOverColumn();
      }}
      onDragLeave={onDragLeaveColumn}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        onDropColumn();
      }}
    >
      <ColumnHeader
        label={stage.label}
        color={color}
        count={convs.length}
        dragControls={controls as DragControls}
        onRename={onRename}
        onColorSelect={onColorSelect}
        onDelete={onDelete}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
        canMoveLeft={canMoveLeft}
        canMoveRight={canMoveRight}
      />

      {/* Cards area — this is what scrolls */}
      <motion.div
        className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 p-2"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {convs.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
            <Inbox size={20} className="text-text-muted/50 mb-2" />
            <span className="text-xs text-text-muted">Nenhum contato</span>
          </div>
        )}
        {convs.map((conv, index) => (
          <motion.div
            key={conv.jid}
            variants={cardEntrance}
            custom={index}
            transition={{ delay: index * 0.03 }}
          >
            <KanbanCard conv={conv} onDragStart={() => onCardDragStart(conv)} />
          </motion.div>
        ))}
      </motion.div>
    </Reorder.Item>
  );
}

export function KanbanBoard() {
  const { data: conversations, isLoading: convLoading } = useConversations();
  const { data: stages, isLoading: stagesLoading } = useFunnelStages();
  const qc = useQueryClient();

  const createStage = useCreateStage();
  const updateStage = useUpdateFunnelStage();
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();

  const [draggedConv, setDraggedConv] = useState<ConversationListItem | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Agrupa conversas por key de estágio, dinamicamente (não mais o Record fixo
  // S0..S6). Cards com key sem coluna correspondente ficam de fora (a coluna
  // pode ter sido removida no cache antes da revalidação).
  const convByStage = useMemo(() => {
    const map = new Map<string, ConversationListItem[]>();
    (stages ?? []).forEach((s) => map.set(s.key, []));
    conversations?.forEach((c) => {
      const bucket = map.get(c.stage);
      if (bucket) bucket.push(c);
    });
    return map;
  }, [conversations, stages]);

  // Card move entre colunas (HTML5 DnD). `stageKey` é a key dinâmica da coluna alvo.
  const handleCardDrop = async (stageKey: string) => {
    const conv = draggedConv;
    setDraggedConv(null);
    setDragOverStage(null);
    if (!conv || conv.stage === stageKey) return;

    const label = conv.contactName || conv.phoneDisplay;
    const targetLabel = stages?.find((s) => s.key === stageKey)?.label ?? stageKey;

    // Optimistic: move o card na hora; reconcilia/reverte na resposta.
    qc.setQueryData<ConversationListItem[]>(['conversations'], (old) =>
      old?.map((c) => (c.jid === conv.jid ? { ...c, stage: stageKey } : c)),
    );

    try {
      await api(`/api/v1/conversations/${encodeURIComponent(conv.jid)}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage: stageKey }),
      });
      notify.success(`${label} movido para ${targetLabel}`);
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    } catch {
      notify.error('Erro ao mover');
      qc.invalidateQueries({ queryKey: ['conversations'] }); // revert
    }
  };

  // Reorder de colunas (Reorder.Group). Recebe a nova ordem (lista de DTOs) e
  // dispara o POST /reorder. A escrita otimista no cache é do próprio hook
  // (`onMutate` roda de forma síncrona e captura o `prev` PRÉ-arraste para o
  // revert correto no erro) — não duplicamos aqui para não estragar o snapshot
  // de revert.
  const handleReorder = useCallback(
    (next: FunnelStageDto[]) => {
      reorderStages.mutate(
        next.map((s) => s.id),
        { onError: () => notify.error('Erro ao reordenar') },
      );
    },
    [reorderStages],
  );

  // Move uma coluna uma posição (mobile) trocando com a vizinha e reusando o
  // mesmo caminho de reorder.
  const moveColumn = (index: number, dir: -1 | 1) => {
    if (!stages) return;
    const target = index + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    handleReorder(next);
  };

  const handleRename = (stage: FunnelStageDto, label: string) => {
    updateStage.mutate(
      { id: stage.id, label },
      { onError: () => notify.error('Erro ao renomear coluna') },
    );
  };

  const handleColor = (stage: FunnelStageDto, color: string) => {
    updateStage.mutate(
      { id: stage.id, color },
      { onError: () => notify.error('Erro ao alterar cor') },
    );
  };

  // Excluir — PESSIMISTA. Coluna vazia exclui direto; com cards, o backend
  // responde 409 e a message pronta vira o toast (a coluna FICA).
  const handleDelete = (stage: FunnelStageDto) => {
    deleteStage.mutate(stage.id, {
      onSuccess: () => notify.success(`Coluna "${stage.label}" excluída`),
      onError: (err) => {
        // 409 (coluna com cards): usa a message do servidor verbatim. Qualquer
        // outro erro: mensagem genérica.
        if (isApiError(err) && err.status === 409) {
          notify.error(err.message);
        } else {
          notify.error('Erro ao excluir coluna');
        }
      },
    });
  };

  const handleCreate = (label: string, color: string) => {
    createStage.mutate(
      { label, color },
      {
        onSuccess: () => notify.success(`Coluna "${label}" criada`),
        onError: () => notify.error('Erro ao criar coluna'),
      },
    );
  };

  const isLoading = convLoading || stagesLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div
          className="flex-shrink-0 px-5 py-4"
          style={{
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div className="h-5 w-36 skeleton mb-1" />
          <div className="h-3 w-52 skeleton" />
        </div>
        <div className="kanban-scroll flex gap-3 overflow-x-auto p-3 md:p-5 flex-1 min-h-0">
          {Array.from({ length: 7 }).map((_, i) => (
            <ColumnSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  const orderedStages = stages ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 py-4"
        style={{
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            fontSize: 'var(--text-lg)',
            color: 'var(--text-primary)',
            lineHeight: 1.2,
          }}
        >
          Funil de Vendas
        </h1>
        <p className="text-xs text-text-muted mt-0.5">
          Arraste os contatos entre as etapas para atualizar o estágio
        </p>
      </div>

      {/* Board scroll container — colunas preenchem a altura disponível. O
          Reorder.Group cobre só as colunas de estágio; o fantasma "+ Nova
          coluna" fica FORA dele, fixo ao fim. */}
      <div
        className="kanban-scroll flex gap-3 overflow-x-auto p-3 md:p-5 flex-1 min-h-0 items-stretch"
        style={{
          scrollSnapType: 'x proximity',
          scrollPadding: '20px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Reorder.Group
          axis="x"
          values={orderedStages}
          onReorder={handleReorder}
          as="div"
          className="flex gap-3 items-stretch"
          // Sem estilo próprio além do flex; o track herda a altura do pai.
        >
          {/* AnimatePresence anima a saída (exclusão) das colunas; a entrada da
              nova é o `initial/animate` de cada Reorder.Item. */}
          <AnimatePresence initial={false} mode="popLayout">
            {orderedStages.map((stage, index) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                convs={convByStage.get(stage.key) ?? []}
                isOver={dragOverStage === stage.key}
                canMoveLeft={index > 0}
                canMoveRight={index < orderedStages.length - 1}
                onDragOverColumn={() => setDragOverStage(stage.key)}
                onDragLeaveColumn={() => setDragOverStage(null)}
                onDropColumn={() => handleCardDrop(stage.key)}
                onCardDragStart={setDraggedConv}
                onRename={(label) => handleRename(stage, label)}
                onColorSelect={(hex) => handleColor(stage, hex)}
                onDelete={() => handleDelete(stage)}
                onMoveLeft={() => moveColumn(index, -1)}
                onMoveRight={() => moveColumn(index, 1)}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>

        {/* Fantasma "+ Nova coluna" — FORA do Reorder.Group, fixo ao fim. */}
        <AddColumn onCreate={handleCreate} isPending={createStage.isPending} />
      </div>
    </div>
  );
}
