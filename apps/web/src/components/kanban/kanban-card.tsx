'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import { stageColorToken } from '@/lib/stage-colors';
import type { ConversationListItem } from '@nexus/shared';

interface KanbanCardProps {
  conv: ConversationListItem;
  onDragStart: (e: React.DragEvent) => void;
}

function aiBadgeTokens(aiState: string): { label: string; color: string } {
  if (aiState === 'ON') return { label: 'IA', color: 'var(--ai-on)' };
  if (aiState === 'OFF' || aiState === 'OFF_UNTIL') return { label: 'Humano', color: 'var(--ai-paused)' };
  return { label: 'IA off', color: 'var(--ai-off)' };
}

export function KanbanCard({ conv, onDragStart }: KanbanCardProps) {
  const display = conv.contactName || conv.phoneDisplay || '?';
  const initials = display
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const ai = aiBadgeTokens(conv.aiState);
  const stageColor = stageColorToken(conv.stage);

  return (
    <motion.div
      draggable
      onDragStart={onDragStart as unknown as (event: MouseEvent | TouchEvent | PointerEvent) => void}
      whileHover={{
        y: -2,
        boxShadow: 'var(--shadow-panel)',
      }}
      className="cursor-grab active:cursor-grabbing"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-card)',
        padding: 12,
        boxShadow: 'var(--shadow-control)',
        transition: 'border-color var(--duration-fast), box-shadow var(--duration-fast)',
      }}
    >
      {/* Stage accent line */}
      <div
        style={{
          height: 2,
          borderRadius: 1,
          background: stageColor,
          marginBottom: 10,
          opacity: 0.7,
        }}
      />

      {/* Avatar + name + phone + hot flag */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full text-[10px] font-semibold"
          style={{
            width: 30,
            height: 30,
            background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
          }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary truncate leading-tight">
            {display}
          </div>
          <div
            className="text-text-muted truncate leading-tight"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}
          >
            {conv.phoneDisplay}
          </div>
        </div>
        {conv.isHot && (
          <Flame size={13} className="flex-shrink-0" style={{ color: 'var(--warning)' }} />
        )}
      </div>

      {/* Last message preview */}
      {conv.lastMessagePreview && (
        <p className="text-xs text-text-secondary leading-relaxed line-clamp-2 mb-2">
          {conv.lastMessagePreview}
        </p>
      )}

      {/* AI state + tags */}
      <div className="flex items-center gap-1 flex-wrap">
        <span
          className="rounded-full px-1.5 py-0.5 font-medium"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            fontSize: 10,
            color: ai.color,
          }}
        >
          {ai.label}
        </span>
        {conv.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="rounded-full px-1.5 py-0.5 font-medium text-text-muted truncate max-w-[80px]"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              fontSize: 10,
            }}
          >
            {t}
          </span>
        ))}
        {conv.tags.length > 2 && (
          <span
            className="rounded-full px-1.5 py-0.5 font-medium text-text-muted"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              fontSize: 10,
            }}
          >
            +{conv.tags.length - 2}
          </span>
        )}
      </div>

      {/* Footer: last activity */}
      <div className="flex items-center justify-end mt-2 text-xs text-text-muted">
        <span>{timeAgo(conv.lastActivity)}</span>
      </div>
    </motion.div>
  );
}
