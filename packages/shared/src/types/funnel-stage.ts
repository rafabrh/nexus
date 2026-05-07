export type FunnelStageKey = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

export interface FunnelStageInfo {
  key: FunnelStageKey;
  label: string;
  color: string;
  order: number;
  progress: number;
}

const STAGES: Record<FunnelStageKey, Omit<FunnelStageInfo, 'key' | 'progress'>> = {
  S0: { label: 'Primeiro contato', color: '#6B7280', order: 0 },
  S1: { label: 'Interesse',        color: '#3B82F6', order: 1 },
  S2: { label: 'Descoberta',       color: '#8B5CF6', order: 2 },
  S3: { label: 'Apresentacao',     color: '#F59E0B', order: 3 },
  S4: { label: 'Proposta',         color: '#EF4444', order: 4 },
  S5: { label: 'Negociacao',       color: '#10B981', order: 5 },
  S6: { label: 'Fechamento',       color: '#F97316', order: 6 },
};

export const FunnelStage = {
  fromString(s: string | null | undefined): FunnelStageInfo {
    const key = (s?.toUpperCase() ?? 'S0') as FunnelStageKey;
    const info = STAGES[key] ?? STAGES.S0;
    const actualKey = STAGES[key] ? key : 'S0';
    return {
      key: actualKey,
      ...info,
      progress: (info.order / 6) * 100,
    };
  },

  all(): FunnelStageInfo[] {
    return Object.entries(STAGES).map(([key, info]) => ({
      key: key as FunnelStageKey,
      ...info,
      progress: (info.order / 6) * 100,
    }));
  },
};
