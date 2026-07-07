import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Ordem das seções REORDENÁVEIS do painel de detalhes (da "Etapa do Funil" pra
 * baixo). "Lead" e "Controle IA" ficam fixos no topo e não entram aqui. A ordem
 * é uma preferência do operador — persistida por navegador (localStorage).
 */
export type DetailSectionId = 'funnel' | 'tags' | 'notes' | 'quick' | 'reminders';

export const DEFAULT_SECTION_ORDER: DetailSectionId[] = [
  'funnel',
  'tags',
  'notes',
  'quick',
  'reminders',
];

/**
 * Garante que a ordem salva tenha EXATAMENTE os ids conhecidos: descarta ids
 * desconhecidos (ex.: seção renomeada/removida numa versão futura) e acrescenta
 * no fim, na ordem padrão, qualquer id que esteja faltando. Assim uma seção nova
 * nunca "some" só porque o localStorage antigo não a conhecia.
 */
export function normalizeOrder(order: readonly DetailSectionId[]): DetailSectionId[] {
  const known = new Set<DetailSectionId>(DEFAULT_SECTION_ORDER);
  const seen = new Set<DetailSectionId>();
  const kept: DetailSectionId[] = [];
  for (const id of order) {
    if (known.has(id) && !seen.has(id)) {
      kept.push(id);
      seen.add(id);
    }
  }
  for (const id of DEFAULT_SECTION_ORDER) {
    if (!seen.has(id)) kept.push(id);
  }
  return kept;
}

interface DetailSectionsState {
  order: DetailSectionId[];
  setOrder: (order: DetailSectionId[]) => void;
}

export const useDetailSectionsStore = create<DetailSectionsState>()(
  persist(
    (set) => ({
      order: DEFAULT_SECTION_ORDER,
      setOrder: (order) => set({ order: normalizeOrder(order) }),
    }),
    { name: 'nexus-detail-sections', version: 1 },
  ),
);
