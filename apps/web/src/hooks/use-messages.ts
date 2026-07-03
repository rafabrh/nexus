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

export interface SendMessagePayload {
  text: string;
  /** Id da mensagem citada (responder). Ausente = mensagem normal. */
  quotedId?: string;
  /** Citação para exibição otimista imediata na bolha (o servidor devolve a real). */
  quoted?: Message['quoted'];
}

export function useSendMessage(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    // Só `text` e `quotedId` vão ao backend; `quoted` é apenas para o otimismo.
    mutationFn: ({ text, quotedId }: SendMessagePayload) =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/send`, {
        method: 'POST',
        body: JSON.stringify({ text, quotedId }),
      }),
    onMutate: async ({ text, quoted }: SendMessagePayload) => {
      await qc.cancelQueries({ queryKey: ['messages', jid] });
      const prev = qc.getQueryData<Message[]>(['messages', jid]);
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        role: 'assistant',
        content: text,
        mediaType: 'text',
        ts: null,
        quoted: quoted ?? null,
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

export interface SendMediaPayload {
  mediatype: 'image' | 'video' | 'document';
  media: string; // base64 sem o prefixo data:
  fileName?: string;
  caption?: string;
  mimetype?: string;
}

export function useSendMedia(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendMediaPayload) =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/send-media`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', jid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
