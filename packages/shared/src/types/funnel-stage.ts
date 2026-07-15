/**
 * Estágios do funil.
 *
 * Antes eram uma união fixa e global `S0..S6`. Com o funil dinâmico por-tenant
 * (tabela `funnel_stages`), o `key` de um estágio é apenas uma string estável
 * gerada por-tenant (slug do rótulo); o painel é dono e o N8N do cliente reporta
 * via Connector mapeado. Por isso `FunnelStageKey` é `string` — NÃO mais uma
 * união fechada.
 *
 * Os 7 estágios históricos (`S0..S6`) permanecem como `DEFAULT_STAGES`: usados
 * para (a) semear cada tenant na migração e (b) fallback estático no front
 * enquanto ele não é migrado para o hook `useFunnelStages()`.
 *
 * Compatibilidade: `FunnelStage.all()` e `FunnelStage.fromString()` seguem
 * existindo com a mesma assinatura para os consumidores atuais do web.
 */

/**
 * Chave de um estágio do funil. Estável e única por-tenant (slug), NÃO o rótulo.
 * Relaxado de uma união fixa `'S0'..'S6'` para `string` para suportar estágios
 * dinâmicos por-tenant. Validação real acontece em runtime contra
 * `funnel_stages` do tenant.
 */
export type FunnelStageKey = string;

export interface FunnelStageInfo {
  key: FunnelStageKey;
  label: string;
  color: string;
  order: number;
  /**
   * Progresso 0-100 derivado da ordem (para barras/indicadores no web).
   * Mantido por compatibilidade com os consumidores atuais (funnel-chart,
   * detail-panel). Para estágios dinâmicos, é derivado de `order` na leitura.
   */
  progress: number;
}

/**
 * Definição base de um estágio para seed/fallback: exatamente
 * `{ key, label, color, order }` — sem `progress`, que é derivado.
 */
export interface FunnelStageSeed {
  key: string;
  label: string;
  color: string;
  order: number;
}

/**
 * Estágio como devolvido pela API por-tenant (`GET/POST/PATCH /funnel/stages`).
 * Inclui `id` (identidade da linha, alvo de PATCH/DELETE/reorder) além do
 * `key` estável. Consumido pelo hook `useFunnelStages()` (frente web posterior).
 */
export interface FunnelStageDto {
  id: string;
  key: string;
  label: string;
  color: string;
  order: number;
}

/**
 * Os 7 estágios default. Semeiam cada tenant existente na migração
 * (keys `S0..S6` PRESERVADOS — o N8N do Shkgroup lê/escreve `followup_step`
 * = `S0..S6`) e servem de fallback estático no front até a migração do web.
 */
export const DEFAULT_STAGES: FunnelStageSeed[] = [
  { key: 'S0', label: 'Primeiro contato', color: '#6B7280', order: 0 },
  { key: 'S1', label: 'Interesse',        color: '#3B82F6', order: 1 },
  { key: 'S2', label: 'Descoberta',       color: '#8B5CF6', order: 2 },
  { key: 'S3', label: 'Apresentacao',     color: '#F59E0B', order: 3 },
  { key: 'S4', label: 'Proposta',         color: '#EF4444', order: 4 },
  { key: 'S5', label: 'Negociacao',       color: '#10B981', order: 5 },
  { key: 'S6', label: 'Fechamento',       color: '#F97316', order: 6 },
];

/** Índice por key dos defaults para lookup O(1) no fallback estático. */
const DEFAULT_BY_KEY: Record<string, FunnelStageSeed> = Object.fromEntries(
  DEFAULT_STAGES.map((s) => [s.key, s]),
);

/**
 * Divisor do progresso: maior `order` entre os defaults. Mantém a semântica
 * histórica (S6 => 100%) sem hardcode do "6".
 */
const MAX_DEFAULT_ORDER = Math.max(...DEFAULT_STAGES.map((s) => s.order)) || 1;

function toInfo(seed: FunnelStageSeed): FunnelStageInfo {
  return {
    key: seed.key,
    label: seed.label,
    color: seed.color,
    order: seed.order,
    progress: (seed.order / MAX_DEFAULT_ORDER) * 100,
  };
}

export const FunnelStage = {
  /**
   * Resolve um `key` (ou string arbitrária) para info de estágio usando os
   * DEFAULTS estáticos. Fallback: `S0`. Preservado para os consumidores atuais
   * do web; estágios dinâmicos por-tenant devem usar o hook `useFunnelStages()`.
   */
  fromString(s: string | null | undefined): FunnelStageInfo {
    const key = s?.toUpperCase() ?? 'S0';
    const seed = DEFAULT_BY_KEY[key] ?? DEFAULT_BY_KEY.S0;
    return toInfo(seed);
  },

  /** Lista os estágios DEFAULT (fallback estático). */
  all(): FunnelStageInfo[] {
    return DEFAULT_STAGES.map(toInfo);
  },
};
