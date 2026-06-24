'use client';

import { motion } from 'framer-motion';
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
import { feedEntry } from '@/lib/motion-variants';
import { stageColorToken } from '@/lib/stage-colors';
import type { NexusEventEnvelope, NexusEventType } from '@nexus/shared';

interface EventConfig {
  icon: React.ElementType;
  /** Tailwind text color class or inline style token */
  colorClass: string;
  /** CSS custom property for the left accent line */
  accentToken: string;
  /** Tailwind bg class for icon bubble */
  bgClass: string;
  label: string;
  variant: 'info' | 'success' | 'warning' | 'error' | 'primary' | 'default';
}

function getEventConfig(type: NexusEventType, stageKey?: string | null): EventConfig {
  switch (type) {
    case 'message.received':
      return {
        icon: MessageCircle,
        colorClass: 'text-[color:var(--info)]',
        accentToken: 'var(--info)',
        bgClass: 'bg-[color:color-mix(in_srgb,var(--info)_12%,transparent)]',
        label: 'Mensagem Recebida',
        variant: 'info',
      };
    case 'ai.thinking':
      return {
        icon: Bot,
        colorClass: 'text-[color:var(--ai-thinking)]',
        accentToken: 'var(--ai-thinking)',
        bgClass: 'bg-[color:color-mix(in_srgb,var(--ai-thinking)_12%,transparent)]',
        label: 'IA Pensando',
        variant: 'info',
      };
    case 'ai.responded':
      return {
        icon: Bot,
        colorClass: 'text-[color:var(--ai-thinking)]',
        accentToken: 'var(--ai-thinking)',
        bgClass: 'bg-[color:color-mix(in_srgb,var(--ai-thinking)_12%,transparent)]',
        label: 'IA Respondeu',
        variant: 'success',
      };
    case 'ai.toggled':
      return {
        icon: ToggleLeft,
        colorClass: 'text-[color:var(--warning)]',
        accentToken: 'var(--warning)',
        bgClass: 'bg-[color:color-mix(in_srgb,var(--warning)_12%,transparent)]',
        label: 'IA Alterada',
        variant: 'warning',
      };
    case 'funnel.changed':
      return {
        icon: ArrowRight,
        colorClass: 'text-[color:var(--accent-500)]',
        accentToken: stageKey ? stageColorToken(stageKey) : 'var(--accent-500)',
        bgClass: 'bg-[color:color-mix(in_srgb,var(--accent-500)_12%,transparent)]',
        label: 'Etapa Alterada',
        variant: 'primary',
      };
    case 'handoff.triggered':
      return {
        icon: AlertTriangle,
        colorClass: 'text-[color:var(--info)]',
        accentToken: 'var(--info)',
        bgClass: 'bg-[color:color-mix(in_srgb,var(--info)_12%,transparent)]',
        label: 'Handoff',
        variant: 'info',
      };
    case 'payment.approved':
      return {
        icon: CreditCard,
        colorClass: 'text-[color:var(--success)]',
        accentToken: 'var(--success)',
        bgClass: 'bg-[color:color-mix(in_srgb,var(--success)_12%,transparent)]',
        label: 'Pagamento Aprovado',
        variant: 'success',
      };
    case 'note.added':
      return {
        icon: StickyNote,
        colorClass: 'text-text-secondary',
        accentToken: 'var(--separator)',
        bgClass: 'bg-[color:var(--bg-elevated)]',
        label: 'Nota Adicionada',
        variant: 'default',
      };
    case 'lead.hot':
      return {
        icon: Flame,
        colorClass: 'text-[color:var(--warning)]',
        accentToken: 'var(--warning)',
        bgClass: 'bg-[color:color-mix(in_srgb,var(--warning)_12%,transparent)]',
        label: 'Lead Quente',
        variant: 'warning',
      };
    default:
      return {
        icon: MessageCircle,
        colorClass: 'text-text-muted',
        accentToken: 'var(--separator)',
        bgClass: 'bg-[color:var(--bg-elevated)]',
        label: type,
        variant: 'default',
      };
  }
}

interface FeedEntryProps {
  event: NexusEventEnvelope;
}

export function FeedEntry({ event }: FeedEntryProps) {
  const payload = event.payload || {};
  const stageKey = typeof payload.stageKey === 'string' ? payload.stageKey : null;
  const config = getEventConfig(event.type, stageKey);
  const Icon = config.icon;

  const clientMsg = typeof payload.clientMessage === 'string' ? payload.clientMessage : null;
  const aiMsg = typeof payload.aiMessage === 'string' ? payload.aiMessage : null;
  const content = typeof payload.content === 'string' ? payload.content : null;

  return (
    <motion.div
      variants={feedEntry}
      initial="initial"
      animate="animate"
      className="glass relative overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-card)',
        padding: '14px 16px',
        border: '1px solid var(--separator)',
      }}
    >
      {/* Left accent line */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '3px',
          borderRadius: 'var(--radius-card) 0 0 var(--radius-card)',
          background: config.accentToken,
          opacity: 0.8,
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2 pl-1">
        <div
          className={cn(
            'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
            config.bgClass,
          )}
        >
          <Icon size={14} className={config.colorClass} />
        </div>
        <div className="flex-1 min-w-0">
          <Badge variant={config.variant}>{config.label}</Badge>
        </div>
        <span className="text-[10px] text-text-muted flex-shrink-0 tabular-nums">
          {timeAgo(new Date(event.ts).toISOString())}
        </span>
      </div>

      {/* Message content grid */}
      {(clientMsg || aiMsg) && (
        <div className="grid grid-cols-2 gap-2 mt-2 pl-1">
          {clientMsg && (
            <div
              style={{
                background: 'var(--bg-elevated)',
                borderRadius: '6px',
                padding: '10px',
                border: '1px solid var(--separator)',
              }}
            >
              <div
                className="text-text-muted"
                style={{
                  fontSize: '9px',
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                CLIENTE
              </div>
              <p className="text-xs text-text-primary leading-relaxed line-clamp-3">{clientMsg}</p>
            </div>
          )}
          {aiMsg && (
            <div
              style={{
                background: 'color-mix(in srgb, var(--ai-thinking) 8%, var(--bg-elevated))',
                border: '1px solid color-mix(in srgb, var(--ai-thinking) 20%, transparent)',
                borderRadius: '6px',
                padding: '10px',
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  color: 'var(--ai-thinking)',
                  marginBottom: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                }}
              >
                NEXUS IA
              </div>
              <p className="text-xs text-text-primary leading-relaxed line-clamp-3">{aiMsg}</p>
            </div>
          )}
        </div>
      )}

      {/* Generic content */}
      {content && !clientMsg && !aiMsg && (
        <p className="text-xs text-text-secondary mt-1 pl-1">{content}</p>
      )}

      {/* JID */}
      <div className="mt-2 text-[10px] text-text-muted font-mono truncate pl-1">{event.jid}</div>
    </motion.div>
  );
}
