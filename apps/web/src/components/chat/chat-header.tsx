'use client';

import { Bot, Flame, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useUiStore } from '@/stores/ui.store';
import { stageColorToken } from '@/lib/stage-colors';
import type { ConversationListItem, AiState } from '@nexus/shared';

function getAiLabel(state: AiState) {
  switch (state) {
    case 'ON':
      return { label: 'IA Ativa', variant: 'success' as const, dot: 'bg-ai-on', isOn: true };
    case 'OFF':
      return { label: 'IA Off', variant: 'default' as const, dot: 'bg-ai-off', isOn: false };
    case 'OFF_UNTIL':
      return { label: 'IA Pausada', variant: 'warning' as const, dot: 'bg-ai-paused', isOn: false };
  }
}

interface ChatHeaderProps {
  conversation: ConversationListItem;
}

export function ChatHeader({ conversation }: ChatHeaderProps) {
  const { detailPanelOpen, toggleDetailPanel } = useUiStore();
  const ai = getAiLabel(conversation.aiState);

  return (
    <div
      className="h-14 flex items-center justify-between px-4 flex-shrink-0 glass mirror"
      style={{
        borderBottom: '1px solid var(--separator)',
        boxShadow: 'inset 0 1px 0 var(--mirror-edge)',
      }}
    >
      {/* Left — contact info. Lifted above the header's specular sheen so the
          reflection sits behind the content, not over the text. */}
      <div className="relative z-10 flex items-center gap-3">
        {/* Avatar 34px — foto do WhatsApp com fallback nas iniciais */}
        <Avatar name={conversation.contactName} url={conversation.avatarUrl} size={34} />

        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-text-primary">
              {conversation.contactName}
            </span>
            {conversation.isHot && (
              <Flame size={12} className="text-warning" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-text-muted font-mono">
              {conversation.phoneDisplay}
            </span>
            <Badge
              style={{
                backgroundColor: `color-mix(in srgb, ${stageColorToken(conversation.stage)} 13%, transparent)`,
                color: stageColorToken(conversation.stage),
              }}
            >
              {conversation.stageLabel}
            </Badge>
          </div>
        </div>
      </div>

      {/* Right — actions. Lifted above the header sheen (z-10) so the toggle's
          hover/click area is never sitting under the decorative overlay. */}
      <div className="relative z-10 flex items-center gap-2">
        {/* AI status pill */}
        <div
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border',
            ai.variant === 'success'
              ? 'bg-success/[0.08] border-success/20'
              : ai.variant === 'warning'
              ? 'bg-warning/[0.08] border-warning/20'
              : 'bg-bg-hover border-border',
          )}
        >
          {/* Dot with optional pulse-ring when ON */}
          <span className="relative flex items-center justify-center" style={{ width: 7, height: 7 }}>
            <span
              className={cn('rounded-full', ai.dot)}
              style={{ width: 7, height: 7, display: 'block' }}
            />
            {ai.isOn && (
              <span
                className={cn('absolute rounded-full animate-ping', ai.dot)}
                style={{ width: 7, height: 7, opacity: 0.5 }}
              />
            )}
          </span>
          <span
            className={cn(
              ai.variant === 'success'
                ? 'text-success'
                : ai.variant === 'warning'
                ? 'text-warning'
                : 'text-text-muted',
            )}
          >
            {ai.label}
          </span>
        </div>

        {/* Toggle detail panel — Liquid Glass button: translucent glass fill,
            specular top edge + soft shadow, with the icon lifted above the
            button's own sheen. Tints to accent when the panel is open. */}
        <button
          type="button"
          onClick={toggleDetailPanel}
          aria-label={detailPanelOpen ? 'Fechar painel de detalhes' : 'Abrir painel de detalhes'}
          title={detailPanelOpen ? 'Fechar Detalhes' : 'Abrir Detalhes'}
          className="mirror relative z-10 flex items-center justify-center transition-[transform,filter,box-shadow] duration-150 active:scale-95 focus-ring"
          style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-input)',
            color: detailPanelOpen ? 'var(--accent-500)' : 'var(--text-secondary)',
            background: detailPanelOpen
              ? 'color-mix(in srgb, var(--accent-500) 16%, var(--glass-bg))'
              : 'var(--glass-bg)',
            border: `1px solid ${
              detailPanelOpen
                ? 'color-mix(in srgb, var(--accent-500) 45%, var(--glass-border))'
                : 'var(--glass-border)'
            }`,
            boxShadow: 'inset 0 1px 0 var(--mirror-edge), var(--shadow-control)',
            backdropFilter: 'blur(var(--glass-blur)) saturate(1.1)',
            WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.filter = 'brightness(1.07)';
            e.currentTarget.style.boxShadow =
              'inset 0 1px 0 var(--mirror-edge), 0 3px 12px rgba(0,0,0,0.16)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.filter = '';
            e.currentTarget.style.boxShadow =
              'inset 0 1px 0 var(--mirror-edge), var(--shadow-control)';
          }}
        >
          <span className="pointer-events-none relative z-10 inline-flex">
            {detailPanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </span>
        </button>
      </div>
    </div>
  );
}
