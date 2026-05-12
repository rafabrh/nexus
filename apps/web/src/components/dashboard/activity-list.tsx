'use client';

import { MessageCircle, Bot, CreditCard, ArrowRight, Flame, AlertTriangle } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { useRealtimeStore } from '@/stores/realtime.store';
import type { NexusEventEnvelope, NexusEventType } from '@nexus/shared';

function getEventConfig(type: NexusEventType) {
  switch (type) {
    case 'message.received':
      return { icon: MessageCircle, color: 'text-info', bg: 'bg-info/10', label: 'Mensagem recebida' };
    case 'ai.thinking':
      return { icon: Bot, color: 'text-ai-thinking', bg: 'bg-info/10', label: 'IA pensando' };
    case 'ai.responded':
      return { icon: Bot, color: 'text-success', bg: 'bg-success/10', label: 'IA respondeu' };
    case 'ai.toggled':
      return { icon: Bot, color: 'text-warning', bg: 'bg-warning/10', label: 'IA alterada' };
    case 'funnel.changed':
      return { icon: ArrowRight, color: 'text-primary-400', bg: 'bg-primary-800/20', label: 'Etapa alterada' };
    case 'handoff.triggered':
      return { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Handoff' };
    case 'payment.approved':
      return { icon: CreditCard, color: 'text-success', bg: 'bg-success/10', label: 'Pagamento' };
    case 'note.added':
      return { icon: MessageCircle, color: 'text-text-secondary', bg: 'bg-bg-hover', label: 'Nota adicionada' };
    case 'lead.hot':
      return { icon: Flame, color: 'text-warning', bg: 'bg-warning/10', label: 'Lead quente' };
    default:
      return { icon: MessageCircle, color: 'text-text-muted', bg: 'bg-bg-hover', label: type };
  }
}

export function ActivityList() {
  const events = useRealtimeStore((s) => s.events);
  const recent = events.slice(0, 20);

  if (recent.length === 0) {
    return (
      <div className="bg-bg-surface border border-border rounded-card p-4">
        <h3 className="text-sm font-medium text-text-secondary mb-4">
          Atividade Recente
        </h3>
        <div className="py-8 text-center text-xs text-text-muted">
          Nenhuma atividade recente. Eventos aparecerrao em tempo real.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-surface border border-border rounded-card p-4">
      <h3 className="text-sm font-medium text-text-secondary mb-4">
        Atividade Recente
      </h3>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {recent.map((event) => {
          const config = getEventConfig(event.type);
          const Icon = config.icon;
          return (
            <div
              key={event.eventId}
              className="flex items-center gap-2.5 py-1.5 px-2 rounded-badge hover:bg-bg-hover transition-colors duration-150"
            >
              <div className={cn('w-6 h-6 rounded-badge flex items-center justify-center flex-shrink-0', config.bg)}>
                <Icon size={12} className={config.color} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-text-primary">{config.label}</span>
              </div>
              <span className="text-[10px] text-text-muted flex-shrink-0">
                {timeAgo(new Date(event.ts).toISOString())}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
