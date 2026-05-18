import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface OnboardingState {
  instanceExists: boolean;
  connectionState: string | null;
  syncStatus: string | null;
}

interface SyncResult {
  status: string;
  chatsImported: number;
  messagesImported: number;
}

export function useOnboardingState(options?: { refetchInterval?: number }) {
  return useQuery<OnboardingState>({
    queryKey: ['onboarding', 'state'],
    queryFn: () => api('/api/v1/onboarding/state'),
    refetchInterval: options?.refetchInterval,
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ instanceName: string; state: string }>('/api/v1/onboarding/instance', {
        method: 'POST',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
    },
  });
}

export function useQrCode(enabled: boolean) {
  return useQuery<{ qrCode: string; expiresIn: number }>({
    queryKey: ['onboarding', 'qr'],
    queryFn: () => api('/api/v1/onboarding/qr'),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useStartSync() {
  const qc = useQueryClient();
  return useMutation<SyncResult>({
    mutationFn: () =>
      api('/api/v1/onboarding/sync', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
    },
  });
}
