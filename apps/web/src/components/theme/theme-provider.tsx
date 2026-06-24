'use client';
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings.store';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    // Apenas Claro/Escuro. Qualquer valor remanescente cai em 'dark'.
    const applied = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', applied);
  }, [theme]);
  return <>{children}</>;
}
