import { create } from 'zustand';
import type { NexusEventEnvelope } from '@nexus/shared';

interface RealtimeState {
  connected: boolean;
  lastEventId: string | null;
  events: NexusEventEnvelope[];
  setConnected: (connected: boolean) => void;
  addEvent: (event: NexusEventEnvelope) => void;
  setLastEventId: (id: string) => void;
}

const MAX_EVENTS = 200;

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connected: false,
  lastEventId: null,
  events: [],
  setConnected: (connected) => set({ connected }),
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, MAX_EVENTS),
      lastEventId: event.eventId,
    })),
  setLastEventId: (id) => set({ lastEventId: id }),
}));
