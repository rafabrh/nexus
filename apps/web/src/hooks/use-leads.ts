import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSettingsStore, refetchIntervalFromSettings } from '@/stores/settings.store';
import type { Lead } from '@nexus/shared';

export function useLeads() {
  // Safety net: reconcile missed funnel.changed events from the lossy channel.
  const interval = useSettingsStore((s) => s.refreshIntervalMs);
  return useQuery<Lead[]>({
    queryKey: ['leads'],
    queryFn: () => api('/api/v1/leads'),
    refetchInterval: refetchIntervalFromSettings(interval),
  });
}
