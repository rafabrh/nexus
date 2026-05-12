'use client';

import { Flame, Bot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/utils';
import type { Lead } from '@nexus/shared';

interface KanbanCardProps {
  lead: Lead;
  onDragStart: (e: React.DragEvent) => void;
}

function getAiBadgeVariant(status: string) {
  if (status === 'ativo') return 'success' as const;
  if (status === 'pago') return 'info' as const;
  return 'default' as const;
}

export function KanbanCard({ lead, onDragStart }: KanbanCardProps) {
  const initials = lead.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="bg-bg-elevated border border-border rounded-card p-3 cursor-grab active:cursor-grabbing hover:border-border-hover transition-colors duration-150 group"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-full bg-bg-hover flex items-center justify-center text-[10px] font-medium text-text-secondary flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-medium text-text-primary truncate">
              {lead.name}
            </span>
          </div>
          <span className="text-xs text-text-muted font-mono">{lead.phone}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <Badge variant={getAiBadgeVariant(lead.status)}>
          {lead.status}
        </Badge>
        {lead.tags.slice(0, 2).map((t) => (
          <Badge key={t} variant="default">
            {t}
          </Badge>
        ))}
        {lead.tags.length > 2 && (
          <Badge variant="default">+{lead.tags.length - 2}</Badge>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-text-muted">
        <span>{lead.totalInteractions} msgs</span>
        <span>{timeAgo(lead.lastContact)}</span>
      </div>
    </div>
  );
}
