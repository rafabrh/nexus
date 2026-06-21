import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSettingsStore, refetchIntervalFromSettings } from '@/stores/settings.store';
import type { DashboardData } from '@nexus/shared';

export function useDashboard() {
  const interval = useSettingsStore((s) => s.refreshIntervalMs);
  return useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api('/api/v1/dashboard'),
    refetchInterval: refetchIntervalFromSettings(interval),
  });
}
