import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Message } from '@nexus/shared';

export function useMessages(jid: string | null) {
  return useQuery<Message[]>({
    queryKey: ['messages', jid],
    queryFn: () =>
      api(`/api/v1/conversations/${encodeURIComponent(jid!)}/messages`),
    enabled: !!jid,
    refetchInterval: 10_000,
  });
}

export function useSendMessage(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/send`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    onMutate: async (text: string) => {
      await qc.cancelQueries({ queryKey: ['messages', jid] });
      const prev = qc.getQueryData<Message[]>(['messages', jid]);
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        role: 'assistant',
        content: text,
        mediaType: 'text',
        ts: null,
      };
      qc.setQueryData<Message[]>(['messages', jid], (old) => [
        ...(old ?? []),
        optimistic,
      ]);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['messages', jid], ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', jid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
