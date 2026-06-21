'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
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
        accentHex: '#3B82F6',
      };
    case 'ai.thinking':
      return {
        icon: Bot,
        color: 'text-ai-thinking',
        bg: 'bg-info/10',
        label: 'IA Pensando',
        variant: 'info' as const,
        accentHex: '#8B5CF6',
      };
    case 'ai.responded':
      return {
        icon: Bot,
        color: 'text-success',
        bg: 'bg-success/10',
        label: 'IA Respondeu',
        variant: 'success' as const,
        accentHex: '#22C55E',
      };
    case 'ai.toggled':
      return {
        icon: ToggleLeft,
        color: 'text-warning',
        bg: 'bg-warning/10',
        label: 'IA Alterada',
        variant: 'warning' as const,
        accentHex: '#F59E0B',
      };
    case 'funnel.changed':
      return {
        icon: ArrowRight,
        color: 'text-primary-400',
        bg: 'bg-primary-800/20',
        label: 'Etapa Alterada',
        variant: 'primary' as const,
        accentHex: '#6366F1',
      };
    case 'handoff.triggered':
      return {
        icon: AlertTriangle,
        color: 'text-error',
        bg: 'bg-error/10',
        label: 'Handoff',
        variant: 'error' as const,
        accentHex: '#EF4444',
      };
    case 'payment.approved':
      return {
        icon: CreditCard,
        color: 'text-success',
        bg: 'bg-success/10',
        label: 'Pagamento Aprovado',
        variant: 'success' as const,
        accentHex: '#22C55E',
      };
    case 'note.added':
      return {
        icon: StickyNote,
        color: 'text-text-secondary',
        bg: 'bg-bg-hover',
        label: 'Nota Adicionada',
        variant: 'default' as const,
        accentHex: '#6B7280',
      };
    case 'lead.hot':
      return {
        icon: Flame,
        color: 'text-warning',
        bg: 'bg-warning/10',
        label: 'Lead Quente',
        variant: 'warning' as const,
        accentHex: '#F59E0B',
      };
    default:
      return {
        icon: MessageCircle,
        color: 'text-text-muted',
        bg: 'bg-bg-hover',
        label: type,
        variant: 'default' as const,
        accentHex: '#6B7280',
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
    <motion.div
      variants={feedEntry}
      initial="initial"
      animate="animate"
      style={{
        position: 'relative',
        background: 'rgba(20,24,32,0.72)',
        backdropFilter: 'blur(12px) saturate(1.2)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '8px',
        padding: '16px',
        overflow: 'hidden',
      }}
    >
      {/* Left accent line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '2px',
          background: config.accentHex,
          boxShadow: `0 0 8px 1px ${config.accentHex}88`,
        }}
      />

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
            <div
              style={{
                background: '#0C0F12',
                borderRadius: '6px',
                padding: '10px',
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  color: 'var(--color-text-muted)',
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
                background: 'rgba(13,148,136,0.05)',
                border: '1px solid rgba(13,148,136,0.15)',
                borderRadius: '6px',
                padding: '10px',
              }}
            >
              <div
                style={{
                  fontSize: '9px',
                  color: 'rgba(20,184,166,0.7)',
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
        <p className="text-xs text-text-secondary mt-1">{content}</p>
      )}

      {/* JID */}
      <div className="mt-2 text-[10px] text-text-muted font-mono truncate">{event.jid}</div>
    </motion.div>
  );
}
