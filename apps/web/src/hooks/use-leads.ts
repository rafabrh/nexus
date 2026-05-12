import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Lead } from '@nexus/shared';

export function useLeads() {
  return useQuery<Lead[]>({
    queryKey: ['leads'],
    queryFn: () => api('/api/v1/leads'),
  });
}
