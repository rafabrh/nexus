import { create } from 'zustand';

type FilterType = 'all' | 'ai_on' | 'human' | 'hot';

interface ConversationState {
  selectedJid: string | null;
  filter: FilterType;
  searchQuery: string;
  setSelectedJid: (jid: string | null) => void;
  setFilter: (filter: FilterType) => void;
  setSearchQuery: (query: string) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  selectedJid: null,
  filter: 'all',
  searchQuery: '',
  setSelectedJid: (jid) => set({ selectedJid: jid }),
  setFilter: (filter) => set({ filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
