import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { FunnelStageDto } from '@nexus/shared';

/**
 * Estágios do funil por-tenant (colunas do Kanban). Substituem `FunnelStage.all()`
 * estático. A fonte de verdade é a API (`GET /funnel/stages`, ordenada por `order`).
 *
 * Todas as mutations fazem update otimista no cache `['funnel-stages']` + revert no
 * erro — MENOS o delete, que é PESSIMISTA (só remove no sucesso): a exclusão pode
 * falhar com 409 quando a coluna tem cards, e nesse caso a coluna deve permanecer.
 */

const STAGES_KEY = ['funnel-stages'] as const;

export function useFunnelStages() {
  return useQuery<FunnelStageDto[]>({
    queryKey: STAGES_KEY,
    queryFn: () => api('/api/v1/funnel/stages'),
    // Estágios mudam raramente; sem polling (o Kanban revalida a lista de conversas,
    // não os estágios). Invalidação vem das próprias mutations.
    staleTime: 60_000,
  });
}

/** Reordena a lista pelo campo `order` (defensivo — a API já devolve ordenado). */
function sortByOrder(list: FunnelStageDto[]): FunnelStageDto[] {
  return [...list].sort((a, b) => a.order - b.order);
}

/**
 * Cria uma coluna nova. Otimista: injeta um placeholder no fim (order = max+1) com
 * um id temporário; o `onSettled` revalida para trocar pelo id/key reais do backend.
 */
export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { label: string; color: string }) =>
      api<FunnelStageDto>('/api/v1/funnel/stages', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: STAGES_KEY });
      const prev = qc.getQueryData<FunnelStageDto[]>(STAGES_KEY);
      const maxOrder = prev?.reduce((m, s) => Math.max(m, s.order), -1) ?? -1;
      const optimistic: FunnelStageDto = {
        id: `optimistic-${Date.now()}`,
        key: `optimistic-${Date.now()}`,
        label: body.label,
        color: body.color,
        order: maxOrder + 1,
      };
      qc.setQueryData<FunnelStageDto[]>(STAGES_KEY, (old) =>
        sortByOrder([...(old ?? []), optimistic]),
      );
      return { prev };
    },
    onError: (_e, _body, ctx) => {
      if (ctx?.prev) qc.setQueryData(STAGES_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: STAGES_KEY });
    },
  });
}

/**
 * Atualiza label, cor e/ou ordem de uma coluna. Otimista: aplica o patch no item
 * correspondente do cache. `key` nunca muda (o backend ignora), então `conversations`
 * não precisa ser mexido — os cards seguem apontando pra mesma key.
 */
export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      label?: string;
      color?: string;
      order?: number;
    }) =>
      api<FunnelStageDto>(`/api/v1/funnel/stages/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onMutate: async ({ id, ...patch }) => {
      await qc.cancelQueries({ queryKey: STAGES_KEY });
      const prev = qc.getQueryData<FunnelStageDto[]>(STAGES_KEY);
      qc.setQueryData<FunnelStageDto[]>(STAGES_KEY, (old) =>
        old ? sortByOrder(old.map((s) => (s.id === id ? { ...s, ...patch } : s))) : old,
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(STAGES_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: STAGES_KEY });
    },
  });
}

/**
 * Exclui uma coluna — PESSIMISTA. NÃO faz update otimista: se a API devolver 409
 * (coluna com cards), o erro é propagado para a UI chamar `notify.error(err.message)`
 * (a message do servidor é o texto pronto do toast) e a coluna FICA. Só remove do
 * cache no `onSuccess` (200).
 */
export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ message: string }>(`/api/v1/funnel/stages/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: (_data, id) => {
      qc.setQueryData<FunnelStageDto[]>(STAGES_KEY, (old) =>
        old ? old.filter((s) => s.id !== id) : old,
      );
      // As conversas da coluna sumida podem ter perdido a referência de estágio;
      // revalida a lista para refletir o novo agrupamento.
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

/**
 * Reordena as colunas em lote. Recebe a lista completa de ids na ordem desejada.
 * Otimista: reescreve o `order` de cada item conforme a posição no array; revert
 * no erro (a UI mostra `notify.error('Erro ao reordenar')`).
 */
export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api<FunnelStageDto[]>('/api/v1/funnel/stages/reorder', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: STAGES_KEY });
      const prev = qc.getQueryData<FunnelStageDto[]>(STAGES_KEY);
      const rank = new Map(ids.map((id, i) => [id, i]));
      qc.setQueryData<FunnelStageDto[]>(STAGES_KEY, (old) =>
        old
          ? sortByOrder(
              old.map((s) => (rank.has(s.id) ? { ...s, order: rank.get(s.id)! } : s)),
            )
          : old,
      );
      return { prev };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(STAGES_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: STAGES_KEY });
    },
  });
}
