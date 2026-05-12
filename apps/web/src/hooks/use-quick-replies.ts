import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { QuickReply } from '@nexus/shared';

export function useQuickReplies() {
  return useQuery<QuickReply[]>({
    queryKey: ['quick-replies'],
    queryFn: () => api('/api/v1/quick-replies'),
  });
}

export function useCreateQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; content: string; shortcut?: string }) =>
      api<QuickReply>('/api/v1/quick-replies', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quick-replies'] });
    },
  });
}

export function useUpdateQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      content?: string;
      shortcut?: string;
    }) =>
      api<QuickReply>(`/api/v1/quick-replies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quick-replies'] });
    },
  });
}

export function useDeleteQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/v1/quick-replies/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quick-replies'] });
    },
  });
}
