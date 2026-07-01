import { create } from 'zustand';

/** Estados de presença que a Evolution emite em `presence.update`. */
export type Presence =
  | 'composing' // digitando
  | 'recording' // gravando áudio
  | 'available' // online
  | 'unavailable' // offline
  | 'paused'; // parou de digitar

interface PresenceState {
  /**
   * Última presença conhecida por JID. Efêmera — alimentada pelo socket, nunca
   * persistida. O `ts` permite ao consumidor expirar um "digitando…" preso caso
   * a Evolution não emita o fim.
   */
  byJid: Record<string, { presence: Presence; ts: number }>;
  setPresence: (jid: string, presence: Presence) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  byJid: {},
  setPresence: (jid, presence) =>
    set((s) => ({
      byJid: { ...s.byJid, [jid]: { presence, ts: Date.now() } },
    })),
}));
