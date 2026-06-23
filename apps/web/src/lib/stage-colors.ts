// Mapeia a chave de estágio do funil para o token CSS macOS correspondente.
// Use sempre isto em vez do stageColor (hex cru) vindo do backend.
const STAGE_TOKEN: Record<string, string> = {
  S0: 'var(--stage-s0)', S1: 'var(--stage-s1)', S2: 'var(--stage-s2)',
  S3: 'var(--stage-s3)', S4: 'var(--stage-s4)', S5: 'var(--stage-s5)', S6: 'var(--stage-s6)',
};
/** Retorna o token CSS de cor para uma chave de estágio (fallback: stage-s0). */
export function stageColorToken(stageKey: string | null | undefined): string {
  return (stageKey && STAGE_TOKEN[stageKey]) || 'var(--stage-s0)';
}
