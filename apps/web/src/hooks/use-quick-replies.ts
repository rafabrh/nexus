import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiUpload } from '@/lib/api';
import type { QuickReply } from '@nexus/shared';

/** Referência de mídia devolvida pelo upload e persistida no template. */
export interface QuickReplyMediaRef {
  id: string;
  type: 'image' | 'video';
  mimetype: string;
  filename: string;
  size: number;
}

/** Resposta do endpoint de upload (`POST /quick-replies/media`). */
export interface UploadedQuickReplyMedia {
  mediaId: string;
  mediaType: 'image' | 'video';
  mimetype: string;
  filename: string;
  size: number;
}

export function useQuickReplies() {
  return useQuery<QuickReply[]>({
    queryKey: ['quick-replies'],
    queryFn: () => api('/api/v1/quick-replies'),
  });
}

export function useCreateQuickReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      content: string;
      shortcut?: string;
      media?: QuickReplyMediaRef;
    }) =>
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
      // null remove a mídia do template.
      media?: QuickReplyMediaRef | null;
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

/**
 * Sobe imagem/vídeo (multipart) para o template. O binário fica em disco no
 * servidor; a resposta traz a referência a ser gravada na resposta rápida.
 */
export function useUploadQuickReplyMedia() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return apiUpload<UploadedQuickReplyMedia>('/api/v1/quick-replies/media', form);
    },
  });
}

/**
 * Envio direto de uma resposta rápida numa conversa. O servidor decide texto vs
 * mídia (e vídeo > 16 MB vira documento), então a UI só precisa do id.
 */
export function useSendQuickReply(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (qrId: string) =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/send-quick-reply/${qrId}`, {
        method: 'POST',
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', jid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
