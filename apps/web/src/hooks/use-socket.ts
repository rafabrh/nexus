'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/stores/auth.store';
import { useRealtimeStore } from '@/stores/realtime.store';
import { queryClient } from '@/lib/query-client';
import type { NexusEventEnvelope, NexusEventType } from '@nexus/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('nexus-event', (envelope: NexusEventEnvelope) => {
      addEvent(envelope);

      // Invalidate relevant query keys
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
