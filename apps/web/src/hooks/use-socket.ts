'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { useRealtimeStore } from '@/stores/realtime.store';
import { useSettingsStore } from '@/stores/settings.store';
import { queryClient } from '@/lib/query-client';
import {
  jidFromPhone,
  type NexusEventEnvelope,
  type NexusEventType,
  type Lead,
  type ConversationListItem,
  type FunnelStageKey,
  type AiState,
} from '@nexus/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Single shared socket across all consumers. useSocket() is mounted both by the
// app-shell SocketManager and by the Conversations page; without reference
// counting, one consumer unmounting (e.g. navigating away from Conversations)
// would tear down the socket for everyone. We only disconnect when the LAST
// consumer leaves, and defer it so a StrictMode/Fast-Refresh remount cancels it.
let sharedSocket: Socket | null = null;
let refCount = 0;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Force a manual reconnect of the shared socket (Settings → "Reconectar"). */
export function reconnectSocket(): void {
  if (sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket.connect();
  }
}

/** A short, subtle WebAudio ping — no asset, respects the sound preference. */
function playPing(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.24);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch {
    /* audio not available — ignore */
  }
}

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
  // Outro dispositivo/aba do mesmo tenant marcou a conversa como lida — refaz a
  // lista para o badge de não-lidas sumir aqui também (leitura sincronizada).
  'conversation.read': [['conversations']],
  // Infrastructure event — handled apart from the feed (see the early return
  // in the nexus-event handler); no query invalidation by this map.
  'connection.update': [],
};

// Patch the matching lead card in the ['leads'] cache to its new stage.
// Returns true when a card matched (so we can skip the broad invalidation).
function patchLeadStage(jid: string, stage: FunnelStageKey): boolean {
  let matched = false;
  queryClient.setQueryData<Lead[]>(['leads'], (old) => {
    if (!old) return old;
    return old.map((lead) => {
      // Leads are keyed by phone in the Sheets CRM, not by JID — derive the
      // canonical JID to match the event's jid.
      if (jidFromPhone(lead.phone) === jid) {
        matched = true;
        return { ...lead, stage };
      }
      return lead;
    });
  });
  return matched;
}

// Patch the matching conversation's stage in place so the Kanban card (which is
// fed by the conversations cache) jumps to its new column instantly.
function patchConversationStage(jid: string, stage: FunnelStageKey): boolean {
  let matched = false;
  queryClient.setQueryData<ConversationListItem[]>(['conversations'], (old) => {
    if (!old) return old;
    return old.map((conv) => {
      if (conv.jid === jid) {
        matched = true;
        return { ...conv, stage };
      }
      return conv;
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
  // Stable selectors — Zustand actions never change identity, so handlers
  // attached once stay valid for the socket's whole life.
  const setConnected = useRealtimeStore((s) => s.setConnected);
  const addEvent = useRealtimeStore((s) => s.addEvent);

  useEffect(() => {
    if (!token) return;

    // A pending teardown (last consumer left, or a StrictMode/Fast-Refresh
    // unmount): cancel it and keep the existing socket. Then register as a
    // consumer.
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
    refCount++;

    const socket =
      sharedSocket ??
      io(API_URL, {
        auth: { token },
        // Default transport negotiation (polling → websocket upgrade). Forcing
        // websocket-first caused "closed before the connection is established"
        // reconnect loops behind the Fastify adapter.
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });
    sharedSocket = socket;
    socketRef.current = socket;

    // Reused sockets must not stack duplicate listeners.
    socket.off('connect');
    socket.off('disconnect');
    socket.off('connect_error');
    socket.off('nexus-event');

    // If we reused an already-connected socket, reflect that immediately —
    // the 'connect' event won't fire again.
    if (socket.connected) setConnected(true);

    socket.on('connect', () => {
      setConnected(true);
      const lastEventId = useRealtimeStore.getState().lastEventId;
      if (lastEventId) {
        socket.emit('replay', { lastEventId });
      }
      // Reconcile events that may have been missed while disconnected: the
      // keyspace channel is lossy, so refetch the list-level caches on connect.
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    });

    socket.on('disconnect', (reason) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[socket] disconnect:', reason);
      }
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[socket] connect_error:', err.message);
      }
    });

    socket.on('nexus-event', (envelope: NexusEventEnvelope) => {
      // Connection state is infrastructure, not a business event: update the
      // store (the ConnectionGuard reacts) and keep it out of the activity feed.
      if (envelope.type === 'connection.update') {
        const state = (envelope.payload?.state as string | undefined) ?? null;
        useRealtimeStore.getState().setInstanceState(state);
        if (state === 'open') {
          // Instance reconnected — refetch the list caches that went stale.
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['leads'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }
        return;
      }

      addEvent(envelope);

      // Subtle sound on inbound activity, when the operator enabled it.
      if (
        (envelope.type === 'message.received' || envelope.type === 'ai.responded') &&
        useSettingsStore.getState().soundEnabled
      ) {
        playPing();
      }

      // Enriched events carry the new value: patch the cache directly instead of
      // refetching everything, then fall back to invalidation only when no cached
      // item matched.
      if (envelope.type === 'funnel.changed') {
        const stage = envelope.payload?.stage as FunnelStageKey | null | undefined;
        if (stage) {
          // Kanban is fed by conversations — move the card to its new column
          // instantly. A brand-new contact not yet cached is picked up by the
          // conversations invalidation below.
          patchConversationStage(envelope.jid, stage);
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
      refCount--;
      socketRef.current = null;
      // Only tear down when the last consumer leaves. Deferred so a StrictMode/
      // Fast-Refresh remount (or a quick navigation between two pages that both
      // use the socket) cancels it and keeps the connection alive.
      if (refCount <= 0) {
        refCount = 0;
        disconnectTimer = setTimeout(() => {
          socket.disconnect();
          sharedSocket = null;
          setConnected(false);
          disconnectTimer = null;
        }, 300);
      }
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
