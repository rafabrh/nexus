'use client';
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings.store';
import { resolveTheme } from '@/lib/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.setAttribute('data-theme', resolveTheme(theme, mq.matches));
    apply();
    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);
  return <>{children}</>;
}
