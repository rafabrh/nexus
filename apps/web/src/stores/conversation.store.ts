import { create } from 'zustand';

type FilterType = 'all' | 'ai_on' | 'human' | 'hot';

/** Mensagem sendo respondida (citação). `id` referencia a original; `preview` é o
 *  trecho curto exibido na barra do composer e no bloco citado; `fromMe` diz se a
 *  original saiu do operador/IA (rótulo/tom da citação). */
export interface ReplyTarget {
  id: string;
  preview: string;
  fromMe: boolean;
}

interface ConversationState {
  selectedJid: string | null;
  filter: FilterType;
  searchQuery: string;
  /** One-shot signal to insert text into the message composer (e.g. a quick
   *  reply clicked in the detail panel). The composer consumes and clears it. */
  composerInsert: { text: string; at: number } | null;
  /** Mensagem citada no composer (responder). Null quando não há citação ativa. */
  replyingTo: ReplyTarget | null;
  setSelectedJid: (jid: string | null) => void;
  setFilter: (filter: FilterType) => void;
  setSearchQuery: (query: string) => void;
  insertIntoComposer: (text: string) => void;
  clearComposerInsert: () => void;
  setReplyingTo: (target: ReplyTarget | null) => void;
  clearReplyingTo: () => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  selectedJid: null,
  filter: 'all',
  searchQuery: '',
  composerInsert: null,
  replyingTo: null,
  // Trocar de conversa zera composer/citação para não vazar contexto entre chats.
  setSelectedJid: (jid) =>
    set({ selectedJid: jid, composerInsert: null, replyingTo: null }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  insertIntoComposer: (text) => set({ composerInsert: { text, at: Date.now() } }),
  clearComposerInsert: () => set({ composerInsert: null }),
  setReplyingTo: (target) => set({ replyingTo: target }),
  clearReplyingTo: () => set({ replyingTo: null }),
}));
