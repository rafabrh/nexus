'use client';

import { Bot, Flame, PanelRightOpen, PanelRightClose, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUiStore } from '@/stores/ui.store';
import type { ConversationListItem, AiState } from '@nexus/shared';

function getAiLabel(state: AiState) {
  switch (state) {
    case 'ON':
      return { label: 'IA Ativa', variant: 'success' as const, dot: 'bg-ai-on' };
    case 'OFF':
      return { label: 'IA Off', variant: 'default' as const, dot: 'bg-ai-off' };
    case 'OFF_UNTIL':
      return { label: 'IA Pausada', variant: 'warning' as const, dot: 'bg-ai-paused' };
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
    <div className="h-14 flex items-center justify-between px-4 border-b border-border bg-bg-surface flex-shrink-0">
      {/* Left — contact info */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-medium text-text-secondary">
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
        {/* AI status badge */}
        <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-badge text-xs', `bg-${ai.variant === 'success' ? 'success' : ai.variant === 'warning' ? 'warning' : 'bg-hover'}/10`)}>
          <span className={cn('w-2 h-2 rounded-full', ai.dot)} />
          <span className={cn(
            ai.variant === 'success' ? 'text-success' : ai.variant === 'warning' ? 'text-warning' : 'text-text-muted'
          )}>
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
