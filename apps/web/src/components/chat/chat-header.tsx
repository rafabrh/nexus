'use client';

import { Bot, Flame, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/stores/ui.store';
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

  const initials = conversation.contactName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className="h-14 flex items-center justify-between px-4 flex-shrink-0 glass"
      style={{ borderBottom: '1px solid var(--separator)' }}
    >
      {/* Left — contact info */}
      <div className="flex items-center gap-3">
        {/* Avatar 34px */}
        <div
          className="rounded-full flex items-center justify-center text-xs font-medium text-text-secondary flex-shrink-0 bg-bg-elevated border border-border"
          style={{ width: 34, height: 34 }}
        >
          {initials}
        </div>

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
                backgroundColor: `${conversation.stageColor}20`,
                color: conversation.stageColor,
              }}
            >
              {conversation.stageLabel}
            </Badge>
          </div>
        </div>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-2">
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

        {/* Toggle detail panel */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDetailPanel}
          title={detailPanelOpen ? 'Fechar painel' : 'Abrir painel'}
        >
          {detailPanelOpen ? (
            <PanelRightClose size={16} className="text-text-secondary" />
          ) : (
            <PanelRightOpen size={16} className="text-text-secondary" />
          )}
        </Button>
      </div>
    </div>
  );
}
