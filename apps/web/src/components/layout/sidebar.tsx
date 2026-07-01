'use client';

import { useMemo } from 'react';
import { Search, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useConversations } from '@/hooks/use-conversations';
import { useConversationStore } from '@/stores/conversation.store';
import { staggerContainer, staggerItem } from '@/lib/motion-variants';
import { stageColorToken } from '@/lib/stage-colors';
import type { ConversationListItem, AiState } from '@nexus/shared';

const FILTERS = [
  { key: 'all' as const, label: 'Todos' },
  { key: 'ai_on' as const, label: 'IA Ativa' },
  { key: 'human' as const, label: 'Humano' },
  { key: 'hot' as const, label: 'Hot' },
];

type FilterKey = 'all' | 'ai_on' | 'human' | 'hot';

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

/**
 * Contador de não-lidas — pílula verde com tratamento liquid-glass: gradiente
 * vertical, sheen branco no topo, sombra interna na base, glow verde difuso e um
 * ring fino. Entra com um "pop" (spring). Segue o verde macOS (--success).
 */
function UnreadBadge({ count }: { count: number }) {
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 24 }}
      className="flex items-center justify-center tabular-nums select-none"
      style={{
        minWidth: 20,
        height: 20,
        padding: '0 6px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1,
        color: '#ffffff',
        backgroundImage:
          'linear-gradient(180deg, color-mix(in srgb, var(--success) 76%, #ffffff) 0%, var(--success) 50%, color-mix(in srgb, var(--success) 84%, #000000) 100%)',
        boxShadow:
          'inset 0 1px 0.5px rgba(255,255,255,0.65), inset 0 -1px 1px color-mix(in srgb, var(--success) 55%, #000000), 0 1px 2px rgba(0,0,0,0.18), 0 0 8px color-mix(in srgb, var(--success) 50%, transparent), 0 0 0 0.5px color-mix(in srgb, var(--success) 38%, transparent)',
      }}
    >
      {count > 99 ? '99+' : count}
    </motion.span>
  );
}

function ConversationItem({
  conversation,
  selected,
  onClick,
  isLast,
}: {
  conversation: ConversationListItem;
  selected: boolean;
  onClick: () => void;
  isLast: boolean;
}) {
  const ai = getAiBadge(conversation.aiState);
  const initials = conversation.contactName
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Selecionada já foi marcada como lida (abrir zera) — o realce de não-lida
  // nunca disputa com o fundo accent da linha selecionada.
  const unread = conversation.unreadCount ?? 0;
  const hasUnread = unread > 0 && !selected;

  return (
    <motion.button
      variants={staggerItem}
      onClick={onClick}
      className={cn(
        'conv-glass relative w-full text-left mx-1.5 px-3 py-3 flex gap-3 transition-colors duration-150 focus-ring',
        !selected && !conversation.isHot && 'hover:bg-bg-hover',
        !selected && conversation.isHot && 'hover:bg-bg-hover border-l-2 border-l-warning',
      )}
      style={{
        borderRadius: 'var(--radius-list-item)',
        ...(selected
          ? {
              // Selected row = glossy accent glass, matching the active header tab.
              backgroundColor: 'var(--accent-500)',
              backgroundImage:
                'linear-gradient(180deg, var(--mirror-sheen-top), transparent 55%)',
              boxShadow: 'inset 0 1px 0 var(--mirror-edge), var(--shadow-control)',
            }
          : {}),
      }}
    >
      {/* Subtle hairline separating conversations — inset past the avatar, like
          the WhatsApp list. Theme-aware via --separator; skipped on the last
          row and the selected (filled) row. */}
      {!isLast && !selected && (
        <span
          aria-hidden
          className="absolute bottom-0 right-3 h-px"
          style={{ left: 56, background: 'var(--separator)' }}
        />
      )}

      {/* Avatar */}
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-medium flex-shrink-0"
        style={{
          background: selected ? 'rgba(255,255,255,0.2)' : 'var(--bg-active)',
          color: selected ? 'rgba(255,255,255,0.9)' : 'var(--text-secondary)',
        }}
      >
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-sm truncate"
              style={{
                color: selected ? '#ffffff' : 'var(--text-primary)',
                fontWeight: hasUnread ? 700 : 500,
              }}
            >
              {conversation.contactName}
            </span>
            {conversation.isHot && (
              <Flame
                size={12}
                className="flex-shrink-0"
                style={{ color: selected ? 'rgba(255,255,255,0.8)' : 'var(--warning)' }}
              />
            )}
          </div>
          {/* Coluna direita: horário no topo, contador de não-lidas abaixo
              (padrão WhatsApp). O horário fica verde quando há não-lidas. */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span
              className="text-xs tabular-nums leading-5"
              style={{
                color: selected
                  ? 'rgba(255,255,255,0.7)'
                  : hasUnread
                    ? 'var(--success)'
                    : 'var(--text-muted)',
                fontWeight: hasUnread ? 600 : 400,
              }}
            >
              {timeAgo(conversation.lastActivity)}
            </span>
            {hasUnread && <UnreadBadge count={unread} />}
          </div>
        </div>

        <p
          className="text-xs truncate mt-0.5"
          style={{
            color: selected
              ? 'rgba(255,255,255,0.75)'
              : hasUnread
                ? 'var(--text-secondary)'
                : 'var(--text-muted)',
            fontWeight: hasUnread ? 500 : 400,
          }}
        >
          {conversation.lastMessagePreview}
        </p>

        <div className="flex items-center gap-1.5 mt-1">
          <Badge variant={ai.variant}>{ai.label}</Badge>
          <Badge
            style={{
              backgroundColor: selected
                ? 'rgba(255,255,255,0.15)'
                : `color-mix(in srgb, ${stageColorToken(conversation.stage)} 13%, transparent)`,
              color: selected ? '#ffffff' : stageColorToken(conversation.stage),
            }}
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
      className="glass fixed top-12 left-0 bottom-0 w-80 flex flex-col z-40"
      style={{
        borderRight: '1px solid var(--separator)',
        borderLeft: 'none',
        borderTop: 'none',
        borderBottom: 'none',
      }}
    >
      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)' }}
          />
          <Input
            type="text"
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Filter — SegmentedControl */}
      <div className="px-3 pb-2">
        <SegmentedControl<FilterKey>
          variant="mirror"
          options={FILTERS.map((f) => ({ label: f.label, value: f.key }))}
          value={filter}
          onChange={setFilter}
          aria-label="Filtrar conversas"
        />
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
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Nenhuma conversa encontrada
            </p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="py-1"
          >
            <AnimatePresence>
              {filtered.map((c, i) => (
                <ConversationItem
                  key={c.jid}
                  conversation={c}
                  selected={selectedJid === c.jid}
                  onClick={() => setSelectedJid(c.jid)}
                  isLast={i === filtered.length - 1}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Footer count */}
      <div
        className="px-4 py-2"
        style={{ borderTop: '1px solid var(--separator)' }}
      >
        <span
          className="font-semibold"
          style={{ fontSize: '11px', color: 'var(--text-secondary)' }}
        >
          {filtered.length} conversa{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>
    </aside>
  );
}
