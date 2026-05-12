import { create } from 'zustand';

interface UiState {
  detailPanelOpen: boolean;
  sidebarCollapsed: boolean;
  toggleDetailPanel: () => void;
  setDetailPanelOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  detailPanelOpen: false,
  sidebarCollapsed: false,
  toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
