'use client';

import { motion } from 'framer-motion';
import { timeAgo } from '@/lib/utils';
import type { Lead } from '@nexus/shared';

interface KanbanCardProps {
  lead: Lead;
  onDragStart: (e: React.DragEvent) => void;
}

function getStatusColor(status: string): string {
  if (status === 'ativo') return '#22c55e';
  if (status === 'pago') return '#3b82f6';
  return '#6b7280';
}

export function KanbanCard({ lead, onDragStart }: KanbanCardProps) {
  const initials = lead.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

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
      {/* Avatar + name + phone */}
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
            {lead.name}
          </div>
          <div
            className="text-text-muted truncate leading-tight"
            style={{ fontFamily: 'monospace', fontSize: 10 }}
          >
            {lead.phone}
          </div>
        </div>
      </div>

      {/* Status + tags */}
      <div className="flex items-center gap-1 flex-wrap">
        {/* Status badge */}
        <span
          className="rounded-full px-1.5 py-0.5 font-medium"
          style={{
            background: '#1A2029',
            border: '1px solid #1E2530',
            fontSize: 10,
            color: getStatusColor(lead.status),
          }}
        >
          {lead.status}
        </span>

        {/* Tag badges */}
        {lead.tags.slice(0, 2).map((t) => (
          <span
            key={t}
            className="rounded-full px-1.5 py-0.5 font-medium text-text-muted truncate max-w-[80px]"
            style={{
              background: '#1A2029',
              border: '1px solid #1E2530',
              fontSize: 10,
            }}
          >
            {t}
          </span>
        ))}
        {lead.tags.length > 2 && (
          <span
            className="rounded-full px-1.5 py-0.5 font-medium text-text-muted"
            style={{
              background: '#1A2029',
              border: '1px solid #1E2530',
              fontSize: 10,
            }}
          >
            +{lead.tags.length - 2}
          </span>
        )}
      </div>

      {/* Footer: interactions + time */}
      <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
        <span>{lead.totalInteractions} msgs</span>
        <span>{timeAgo(lead.lastContact)}</span>
      </div>
    </motion.div>
  );
}
