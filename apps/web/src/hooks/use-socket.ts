'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { useRealtimeStore } from '@/stores/realtime.store';
import { queryClient } from '@/lib/query-client';
import type {
  NexusEventEnvelope,
  NexusEventType,
  Lead,
  ConversationListItem,
  FunnelStageKey,
  AiState,
} from '@nexus/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Scoped invalidation map. ['messages'] prefix-matches every ['messages', jid]
// query, so we no longer need the dead ['conversation-detail'] gap for chat.
const EVENT_TO_QUERY_KEYS: Record<NexusEventType, string[][]> = {
  'message.received': [['conversations'], ['messages']],
  'ai.thinking': [],
  'ai.responded': [['messages'], ['conversations']],
  'ai.toggled': [['conversations'], ['ai-control']],
  'funnel.changed': [['conversations'], ['leads']],
  'handoff.triggered': [['conversations'], ['dashboard']],
  'payment.approved': [['dashboard'], ['leads'], ['conversations']],
  'note.added': [['conversation-detail']],
  'lead.hot': [['conversations']],
};

// Patch the matching lead card in the ['leads'] cache to its new stage.
// Returns true when a card matched (so we can skip the broad invalidation).
function patchLeadStage(jid: string, stage: FunnelStageKey): boolean {
  let matched = false;
  queryClient.setQueryData<Lead[]>(['leads'], (old) => {
    if (!old) return old;
    return old.map((lead) => {
      if (lead.leadId === jid) {
        matched = true;
        return { ...lead, stage };
      }
      return lead;
    });
  });
  return matched;
}

// Patch the matching conversation list item's aiState/aiOffUntil in place.
function patchConversationAi(
  jid: string,
  aiState: AiState,
  aiOffUntil: string | null,
): boolean {
  let matched = false;
  queryClient.setQueryData<ConversationListItem[]>(['conversations'], (old) => {
    if (!old) return old;
    return old.map((conv) => {
      if (conv.jid === jid) {
        matched = true;
        return { ...conv, aiState, aiOffUntil };
      }
      return conv;
    });
  });
  return matched;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((s) => s.token);
  const { setConnected, addEvent, lastEventId } = useRealtimeStore();

  useEffect(() => {
    if (!token) return;

    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      if (lastEventId) {
        socket.emit('replay', { lastEventId });
      }
      // Reconcile events that may have been missed while disconnected: the
      // keyspace channel is lossy, so refetch the list-level caches on connect.
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('nexus-event', (envelope: NexusEventEnvelope) => {
      addEvent(envelope);

      // Enriched events carry the new value: patch the cache directly instead of
      // refetching everything, then fall back to invalidation only when no cached
      // item matched.
      if (envelope.type === 'funnel.changed') {
        const stage = envelope.payload?.stage as FunnelStageKey | null | undefined;
        if (stage) {
          const matched = patchLeadStage(envelope.jid, stage);
          if (!matched) {
            // leadId !== jid (Sheets may key leads differently) — fall back.
            queryClient.invalidateQueries({ queryKey: ['leads'] });
          }
        } else {
          queryClient.invalidateQueries({ queryKey: ['leads'] });
        }
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
        return;
      }

      if (envelope.type === 'ai.toggled') {
        const state = envelope.payload?.state as 'ON' | 'OFF' | undefined;
        if (state === 'ON') {
          patchConversationAi(envelope.jid, 'ON', null);
        } else if (state === 'OFF') {
          const until = envelope.payload?.until as number | null | undefined;
          const aiState: AiState = until ? 'OFF_UNTIL' : 'OFF';
          const aiOffUntil = until ? new Date(until).toISOString() : null;
          patchConversationAi(envelope.jid, aiState, aiOffUntil);
        }
        // Keep ai-control detail fresh; conversation list is already patched.
        queryClient.invalidateQueries({ queryKey: ['ai-control'] });
        return;
      }

      // Default path: scoped invalidation for everything else.
      const keys = EVENT_TO_QUERY_KEYS[envelope.type] || [];
      keys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const joinConversation = (jid: string) => {
    socketRef.current?.emit('join-conversation', { jid });
  };

  const leaveConversation = (jid: string) => {
    socketRef.current?.emit('leave-conversation', { jid });
  };

  return { joinConversation, leaveConversation };
}
