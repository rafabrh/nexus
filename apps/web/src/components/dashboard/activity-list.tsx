'use client';

import { useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { gsap } from 'gsap';
import { MessageCircle, Bot, CreditCard, ArrowRight, Flame, AlertTriangle } from 'lucide-react';
import { cn, timeAgo } from '@/lib/utils';
import { useRealtimeStore } from '@/stores/realtime.store';
import type { NexusEventEnvelope, NexusEventType } from '@nexus/shared';

function getEventConfig(type: NexusEventType) {
  switch (type) {
    case 'message.received':
      return { icon: MessageCircle, color: 'text-info', bg: 'bg-info/10', label: 'Mensagem recebida', accentHex: '#3B82F6' };
    case 'ai.thinking':
      return { icon: Bot, color: 'text-ai-thinking', bg: 'bg-info/10', label: 'IA pensando', accentHex: '#3B82F6' };
    case 'ai.responded':
      return { icon: Bot, color: 'text-success', bg: 'bg-success/10', label: 'IA respondeu', accentHex: '#22C55E' };
    case 'ai.toggled':
      return { icon: Bot, color: 'text-warning', bg: 'bg-warning/10', label: 'IA alterada', accentHex: '#F59E0B' };
    case 'funnel.changed':
      return { icon: ArrowRight, color: 'text-primary-400', bg: 'bg-primary-800/20', label: 'Etapa alterada', accentHex: '#6366F1' };
    case 'handoff.triggered':
      return { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Handoff', accentHex: '#F59E0B' };
    case 'payment.approved':
      return { icon: CreditCard, color: 'text-success', bg: 'bg-success/10', label: 'Pagamento', accentHex: '#22C55E' };
    case 'note.added':
      return { icon: MessageCircle, color: 'text-text-secondary', bg: 'bg-bg-hover', label: 'Nota adicionada', accentHex: '#6B7280' };
    case 'lead.hot':
      return { icon: Flame, color: 'text-warning', bg: 'bg-warning/10', label: 'Lead quente', accentHex: '#F59E0B' };
    default:
      return { icon: MessageCircle, color: 'text-text-muted', bg: 'bg-bg-hover', label: type, accentHex: '#6B7280' };
  }
}

interface ActivityRowProps {
  event: NexusEventEnvelope;
  isNew: boolean;
}

function ActivityRow({ event, isNew }: ActivityRowProps) {
  const config = getEventConfig(event.type);
  const Icon = config.icon;
  const iconRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNew && iconRef.current) {
      gsap.fromTo(
        iconRef.current,
        { boxShadow: `0 0 12px 4px ${config.accentHex}88` },
        { boxShadow: '0 0 0px 0px transparent', duration: 0.6, ease: 'power2.out' },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew]);

  return (
    <motion.div
      initial={isNew ? { y: -8, scale: 0.97, opacity: 0 } : false}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-2.5 py-1.5 px-2 rounded-badge hover:bg-bg-hover transition-colors duration-150"
    >
      <div
        ref={iconRef}
        className={cn('w-6 h-6 rounded-badge flex items-center justify-center flex-shrink-0', config.bg)}
      >
        <Icon size={12} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-text-primary">{config.label}</span>
      </div>
      <span className="text-[10px] text-text-muted flex-shrink-0">
        {timeAgo(new Date(event.ts).toISOString())}
      </span>
    </motion.div>
  );
}

export function ActivityList() {
  const events = useRealtimeStore((s) => s.events);
  const recent = events.slice(0, 20);
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newSet = new Set(recent.map((e) => e.eventId));
    prevIdsRef.current = newSet;
  }, [recent.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const glassStyle: React.CSSProperties = {
    background: 'rgba(20,24,32,0.72)',
    backdropFilter: 'blur(12px) saturate(1.2)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px',
    padding: '16px',
  };

  if (recent.length === 0) {
    return (
      <div style={glassStyle}>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-medium text-text-secondary">Atividade Recente</h3>
        </div>
        <div className="py-8 text-center text-xs text-text-muted">
          Nenhuma atividade recente. Eventos aparecerrao em tempo real.
        </div>
      </div>
    );
  }

  return (
    <div style={glassStyle}>
      {/* Header with live indicator */}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-medium text-text-secondary">Atividade Recente</h3>
        <div className="flex items-center gap-1.5 ml-auto">
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: '#EF4444',
              display: 'inline-block',
              animation: 'live-pulse 1.5s ease-in-out infinite',
            }}
          />
          <span className="text-[10px] font-semibold text-error tracking-wide">AO VIVO</span>
        </div>
      </div>

      <div className="space-y-1 max-h-72 overflow-y-auto">
        <AnimatePresence initial={false}>
          {recent.map((event) => {
            const isNew = !prevIdsRef.current.has(event.eventId);
            return (
              <ActivityRow key={event.eventId} event={event} isNew={isNew} />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
