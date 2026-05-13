'use client';

import { useMemo } from 'react';
import { Search, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useConversations } from '@/hooks/use-conversations';
import { useConversationStore } from '@/stores/conversation.store';
import { staggerContainer, staggerItem } from '@/lib/motion-variants';
import type { ConversationListItem, AiState } from '@nexus/shared';

const FILTERS = [
  { key: 'all' as const, label: 'Todos' },
  { key: 'ai_on' as const, label: 'IA Ativa' },
  { key: 'human' as const, label: 'Humano' },
  { key: 'hot' as const, label: 'Hot' },
];

function getAiBadge(state: AiState) {
  switch (state) {
    case 'ON':
      return { label: 'IA', variant: 'success' as const };
    case 'OFF':
      return { label: 'OFF', variant: 'default' as const };
    case 'OFF_UNTIL':
      return { label: 'Pausa', variant: 'warning' as const };
  }
}

function ConversationSkeleton({ index }: { index: number }) {
  return (
    <div
      className="px-4 py-3 flex gap-3"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="w-9 h-9 rounded-full skeleton flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-24 skeleton" />
        <div className="h-3 w-40 skeleton" />
      </div>
    </div>
  );
}

function ConversationItem({
  conversation,
  selected,
  onClick,
}: {
  conversation: ConversationListItem;
  selected: boolean;
  onClick: () => void;
}) {
  const ai = getAiBadge(conversation.aiState);
  const initials = conversation.contactName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <motion.button
      variants={staggerItem}
      onClick={onClick}
      className={cn(
        'w-full text-left mx-1.5 py-3 flex gap-3 transition-colors duration-150 rounded-lg',
        'hover:bg-bg-hover',
        selected
          ? 'border-l-2 border-l-primary-500'
          : conversation.isHot
          ? 'border-l-2 border-l-warning'
          : '',
      )}
      style={
        selected
          ? { background: 'rgba(37,48,64,0.6)', paddingLeft: '14px', paddingRight: '12px' }
          : { paddingLeft: '16px', paddingRight: '12px' }
      }
    >
      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium text-text-secondary"
        style={{ background: 'linear-gradient(135deg, #1A2029, #1F2733)' }}
      >
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-text-primary truncate">
              {conversation.contactName}
            </span>
            {conversation.isHot && (
              <Flame size={12} className="text-warning flex-shrink-0" />
            )}
          </div>
          <span className="text-xs text-text-muted flex-shrink-0">
            {timeAgo(conversation.lastActivity)}
          </span>
        </div>

        <p className="text-xs text-text-muted truncate mt-0.5">
          {conversation.lastMessagePreview}
        </p>

        <div className="flex items-center gap-1.5 mt-1">
          <Badge variant={ai.variant}>{ai.label}</Badge>
          <Badge
            style={{ backgroundColor: `${conversation.stageColor}20`, color: conversation.stageColor }}
          >
            {conversation.stageLabel}
          </Badge>
        </div>
      </div>
    </motion.button>
  );
}

export function Sidebar() {
  const { data: conversations, isLoading } = useConversations();
  const { selectedJid, setSelectedJid, filter, setFilter, searchQuery, setSearchQuery } =
    useConversationStore();

  const filtered = useMemo(() => {
    if (!conversations) return [];
    let list = conversations;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.contactName.toLowerCase().includes(q) ||
          c.phoneDisplay.includes(q) ||
          c.lastMessagePreview.toLowerCase().includes(q),
      );
    }

    // Filter
    switch (filter) {
      case 'ai_on':
        list = list.filter((c) => c.aiState === 'ON');
        break;
      case 'human':
        list = list.filter((c) => c.aiState === 'OFF' || c.aiState === 'OFF_UNTIL');
        break;
      case 'hot':
        list = list.filter((c) => c.isHot);
        break;
    }

    return list;
  }, [conversations, searchQuery, filter]);

  return (
    <aside
      className="fixed top-12 left-0 bottom-0 w-80 flex flex-col z-40"
      style={{
        backdropFilter: 'blur(12px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(20,24,32,0.6)',
      }}
    >
      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-8 pr-3 rounded-input border border-border text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary-600 focus:shadow-[0_0_0_2px_rgba(99,102,241,0.15)] transition-all duration-150"
            style={{ background: '#0C0F12' }}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="px-3 pb-2 flex gap-1">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'relative text-xs px-2.5 py-1 rounded-full transition-colors duration-150',
                active
                  ? 'text-primary-400'
                  : 'text-text-muted hover:text-text-secondary hover:bg-bg-hover',
              )}
              style={
                active
                  ? {
                      background: 'rgba(129,140,248,0.08)',
                      border: '1px solid rgba(129,140,248,0.12)',
                    }
                  : {}
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <ConversationSkeleton key={i} index={i} />
            ))}
          </>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-text-muted">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="py-1"
          >
            <AnimatePresence>
              {filtered.map((c) => (
                <ConversationItem
                  key={c.jid}
                  conversation={c}
                  selected={selectedJid === c.jid}
                  onClick={() => setSelectedJid(c.jid)}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Footer count */}
      <div
        className="px-4 py-2"
        style={{
          background: 'rgba(20,24,32,0.5)',
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <span className="text-xs text-text-muted">
          {filtered.length} conversa{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>
    </aside>
  );
}
