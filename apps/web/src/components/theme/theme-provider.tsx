'use client';
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings.store';
import { resolveTheme } from '@/lib/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.setAttribute('data-theme', resolveTheme(theme, mql.matches));
    };
    apply();
    // Só reage às mudanças do SO enquanto a preferência é 'system'.
    if (theme !== 'system') return;
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);
  return <>{children}</>;
}
