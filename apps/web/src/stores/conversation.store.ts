import { create } from 'zustand';

type FilterType = 'all' | 'ai_on' | 'human' | 'hot';

interface ConversationState {
  selectedJid: string | null;
  filter: FilterType;
  searchQuery: string;
  /** One-shot signal to insert text into the message composer (e.g. a quick
   *  reply clicked in the detail panel). The composer consumes and clears it. */
  composerInsert: { text: string; at: number } | null;
  setSelectedJid: (jid: string | null) => void;
  setFilter: (filter: FilterType) => void;
  setSearchQuery: (query: string) => void;
  insertIntoComposer: (text: string) => void;
  clearComposerInsert: () => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  selectedJid: null,
  filter: 'all',
  searchQuery: '',
  composerInsert: null,
  setSelectedJid: (jid) => set({ selectedJid: jid, composerInsert: null }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  insertIntoComposer: (text) => set({ composerInsert: { text, at: Date.now() } }),
  clearComposerInsert: () => set({ composerInsert: null }),
}));
