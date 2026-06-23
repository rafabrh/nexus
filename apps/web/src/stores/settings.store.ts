import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemePref } from '@/lib/theme';

export const REFRESH_OPTIONS = [
  { label: '15s', value: 15_000 },
  { label: '30s', value: 30_000 },
  { label: '45s', value: 45_000 },
  { label: '60s', value: 60_000 },
  { label: 'Desligado', value: 0 },
] as const;

interface SettingsState {
  /** Operator display name shown in the UI (falls back to the JWT email). */
  displayName: string;
  /** Play a subtle sound when a realtime event/message arrives. */
  soundEnabled: boolean;
  /** Auto-refresh interval for list queries (ms). 0 = disabled. */
  refreshIntervalMs: number;
  /** User's preferred color scheme. */
  theme: ThemePref;
  setDisplayName: (n: string) => void;
  setSoundEnabled: (b: boolean) => void;
  setRefreshIntervalMs: (ms: number) => void;
  setTheme: (t: ThemePref) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      displayName: '',
      soundEnabled: false,
      refreshIntervalMs: 45_000,
      theme: 'system',
      setDisplayName: (displayName) => set({ displayName }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setRefreshIntervalMs: (refreshIntervalMs) => set({ refreshIntervalMs }),
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'nexus-settings' },
  ),
);

/** Returns the configured interval for React Query, or false when disabled. */
export function refetchIntervalFromSettings(ms: number): number | false {
  return ms > 0 ? ms : false;
}
