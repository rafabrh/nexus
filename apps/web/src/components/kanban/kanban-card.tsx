'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { timeAgo } from '@/lib/utils';
import type { ConversationListItem } from '@nexus/shared';

interface KanbanCardProps {
  conv: ConversationListItem;
  onDragStart: (e: React.DragEvent) => void;
}

function aiBadge(aiState: string): { label: string; color: string } {
  if (aiState === 'ON') return { label: 'IA', color: '#22C55E' };
  if (aiState === 'OFF' || aiState === 'OFF_UNTIL') return { label: 'Humano', color: '#F59E0B' };
  return { label: 'IA off', color: '#8B95A5' };
}

export function KanbanCard({ conv, onDragStart }: KanbanCardProps) {
  const display = conv.contactName || conv.phoneDisplay || '?';
  const initials = display
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const ai = aiBadge(conv.aiState);

  return (
    <motion.div
      draggable
      onDragStart={onDragStart as unknown as (event: MouseEvent | TouchEvent | PointerEvent) => void}
      whileHover={{
        y: -1,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        borderColor: '#2A3545',
      }}
      className="cursor-grab active:cursor-grabbing"
      style={{
        background: '#141820',
        border: '1px solid #1E2530',
        borderRadius: 10,
        padding: 12,
        transition: 'border-color 0.15s',
      }}
    >
      {/* Avatar + name + phone + hot flag */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full text-[10px] font-semibold text-text-secondary"
          style={{
            width: 30,
            height: 30,
            background: 'linear-gradient(135deg, #1A2029, #1F2733)',
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
            style={{ fontFamily: 'monospace', fontSize: 10 }}
          >
            {conv.phoneDisplay}
          </div>
        </div>
        {conv.isHot && (
          <Flame size={13} className="flex-shrink-0" style={{ color: '#F59E0B' }} />
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
            background: '#1A2029',
            border: '1px solid #1E2530',
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
            style={{ background: '#1A2029', border: '1px solid #1E2530', fontSize: 10 }}
          >
            {t}
          </span>
        ))}
        {conv.tags.length > 2 && (
          <span
            className="rounded-full px-1.5 py-0.5 font-medium text-text-muted"
            style={{ background: '#1A2029', border: '1px solid #1E2530', fontSize: 10 }}
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
