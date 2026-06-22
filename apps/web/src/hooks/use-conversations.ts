import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSettingsStore, refetchIntervalFromSettings } from '@/stores/settings.store';
import type {
  ConversationListItem,
  ConversationDetail,
  AiControlResponse,
  AiToggleRequest,
  FunnelStageKey,
} from '@nexus/shared';

export function useConversations() {
  // Safety net: realtime keyspace channel is lossy, so poll the list at the
  // operator-configured interval (Settings → auto-refresh).
  const interval = useSettingsStore((s) => s.refreshIntervalMs);
  return useQuery<ConversationListItem[]>({
    queryKey: ['conversations'],
    queryFn: () => api('/api/v1/conversations'),
    refetchInterval: refetchIntervalFromSettings(interval),
  });
}

export function useConversationDetail(jid: string | null) {
  return useQuery<ConversationDetail>({
    queryKey: ['conversation-detail', jid],
    queryFn: () => api(`/api/v1/conversations/${encodeURIComponent(jid!)}`),
    enabled: !!jid,
  });
}

export function useAiControl(jid: string | null) {
  return useQuery<AiControlResponse>({
    queryKey: ['ai-control', jid],
    queryFn: () => api(`/api/v1/conversations/${encodeURIComponent(jid!)}/ai`),
    enabled: !!jid,
  });
}

export function useToggleAi(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AiToggleRequest) =>
      api<AiControlResponse>(
        `/api/v1/conversations/${encodeURIComponent(jid)}/ai`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-control', jid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useAddNote(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation-detail', jid] });
    },
  });
}

export function useDeleteNote(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (index: number) =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/notes/${index}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation-detail', jid] });
    },
  });
}

export function useAddTag(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tag: string) =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tag }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation-detail', jid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useDeleteTag(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tag: string) =>
      api(
        `/api/v1/conversations/${encodeURIComponent(jid)}/tags/${encodeURIComponent(tag)}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation-detail', jid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useUpdateStage(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage: FunnelStageKey) =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/stage`, {
        method: 'POST',
        body: JSON.stringify({ stage }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation-detail', jid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useToggleHot(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (isHot: boolean) =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/hot`, {
        method: 'POST',
        body: JSON.stringify({ isHot }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation-detail', jid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useResetConversation(jid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/api/v1/conversations/${encodeURIComponent(jid)}/reset`, {
        method: 'POST',
        body: '{}',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation-detail', jid] });
      qc.invalidateQueries({ queryKey: ['ai-control', jid] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
