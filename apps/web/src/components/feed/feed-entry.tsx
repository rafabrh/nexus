'use client';

import {
  MessageCircle,
  Bot,
  CreditCard,
  ArrowRight,
  Flame,
  AlertTriangle,
  ToggleLeft,
  StickyNote,
} from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { NexusEventEnvelope, NexusEventType } from '@nexus/shared';

function getEventConfig(type: NexusEventType) {
  switch (type) {
    case 'message.received':
      return {
        icon: MessageCircle,
        color: 'text-info',
        bg: 'bg-info/10',
        label: 'Mensagem Recebida',
        variant: 'info' as const,
      };
    case 'ai.thinking':
      return {
        icon: Bot,
        color: 'text-ai-thinking',
        bg: 'bg-info/10',
        label: 'IA Pensando',
        variant: 'info' as const,
      };
    case 'ai.responded':
      return {
        icon: Bot,
        color: 'text-success',
        bg: 'bg-success/10',
        label: 'IA Respondeu',
        variant: 'success' as const,
      };
    case 'ai.toggled':
      return {
        icon: ToggleLeft,
        color: 'text-warning',
        bg: 'bg-warning/10',
        label: 'IA Alterada',
        variant: 'warning' as const,
      };
    case 'funnel.changed':
      return {
        icon: ArrowRight,
        color: 'text-primary-400',
        bg: 'bg-primary-800/20',
        label: 'Etapa Alterada',
        variant: 'primary' as const,
      };
    case 'handoff.triggered':
      return {
        icon: AlertTriangle,
        color: 'text-error',
        bg: 'bg-error/10',
        label: 'Handoff',
        variant: 'error' as const,
      };
    case 'payment.approved':
      return {
        icon: CreditCard,
        color: 'text-success',
        bg: 'bg-success/10',
        label: 'Pagamento Aprovado',
        variant: 'success' as const,
      };
    case 'note.added':
      return {
        icon: StickyNote,
        color: 'text-text-secondary',
        bg: 'bg-bg-hover',
        label: 'Nota Adicionada',
        variant: 'default' as const,
      };
    case 'lead.hot':
      return {
        icon: Flame,
        color: 'text-warning',
        bg: 'bg-warning/10',
        label: 'Lead Quente',
        variant: 'warning' as const,
      };
    default:
      return {
        icon: MessageCircle,
        color: 'text-text-muted',
        bg: 'bg-bg-hover',
        label: type,
        variant: 'default' as const,
      };
  }
}

interface FeedEntryProps {
  event: NexusEventEnvelope;
}

export function FeedEntry({ event }: FeedEntryProps) {
  const config = getEventConfig(event.type);
  const Icon = config.icon;

  const payload = event.payload || {};
  const clientMsg = typeof payload.clientMessage === 'string' ? payload.clientMessage : null;
  const aiMsg = typeof payload.aiMessage === 'string' ? payload.aiMessage : null;
  const content = typeof payload.content === 'string' ? payload.content : null;

  return (
    <div className="bg-bg-surface border border-border rounded-card p-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={cn(
            'w-7 h-7 rounded-input flex items-center justify-center flex-shrink-0',
            config.bg,
          )}
        >
          <Icon size={14} className={config.color} />
        </div>
        <div className="flex-1 min-w-0">
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
        <span className="text-[10px] text-text-muted flex-shrink-0">
          {timeAgo(new Date(event.ts).toISOString())}
        </span>
      </div>

      {/* Message content grid */}
      {(clientMsg || aiMsg) && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {clientMsg && (
            <div className="bg-bg-elevated rounded-input p-2.5">
              <div className="text-[10px] text-text-muted mb-1 uppercase font-medium">
                Cliente
              </div>
              <p className="text-xs text-text-primary leading-relaxed line-clamp-3">
                {clientMsg}
              </p>
            </div>
          )}
          {aiMsg && (
            <div className="bg-primary-800/20 rounded-input p-2.5">
              <div className="text-[10px] text-primary-400/70 mb-1 uppercase font-medium">
                IA
              </div>
              <p className="text-xs text-text-primary leading-relaxed line-clamp-3">
                {aiMsg}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Generic content */}
      {content && !clientMsg && !aiMsg && (
        <p className="text-xs text-text-secondary mt-1">{content}</p>
      )}

      {/* JID */}
      <div className="mt-2 text-[10px] text-text-muted font-mono truncate">
        {event.jid}
      </div>
    </div>
  );
}
