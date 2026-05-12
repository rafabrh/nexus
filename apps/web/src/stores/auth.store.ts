import { create } from 'zustand';
import { setAccessToken } from '@/lib/api';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  setToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isAuthenticated: false,
  setToken: (token) => {
    setAccessToken(token);
    set({ token, isAuthenticated: !!token });
  },
  logout: () => {
    setAccessToken(null);
    set({ token: null, isAuthenticated: false });
  },
}));
