import { create } from 'zustand';
import type { NexusEventEnvelope } from '@nexus/shared';

interface RealtimeState {
  connected: boolean;
  /** WhatsApp instance connection state pushed by the backend (open/connecting/
   *  close/absent). null = unknown yet. Distinct from `connected` (socket). */
  instanceState: string | null;
  lastEventId: string | null;
  events: NexusEventEnvelope[];
  setConnected: (connected: boolean) => void;
  setInstanceState: (state: string | null) => void;
  addEvent: (event: NexusEventEnvelope) => void;
  setLastEventId: (id: string) => void;
}

const MAX_EVENTS = 200;

export const useRealtimeStore = create<RealtimeState>((set) => ({
  connected: false,
  instanceState: null,
  lastEventId: null,
  events: [],
  setConnected: (connected) => set({ connected }),
  setInstanceState: (instanceState) => set({ instanceState }),
  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, MAX_EVENTS),
      lastEventId: event.eventId,
    })),
  setLastEventId: (id) => set({ lastEventId: id }),
}));
