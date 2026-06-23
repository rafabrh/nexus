'use client';

import { SegmentedControl } from './segmented-control';
import { useSettingsStore } from '@/stores/settings.store';
import type { ThemePref } from '@/lib/theme';

export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  return (
    <SegmentedControl<ThemePref>
      aria-label="Tema"
      value={theme}
      onChange={setTheme}
      options={[
        { label: 'Sistema', value: 'system' },
        { label: 'Claro', value: 'light' },
        { label: 'Escuro', value: 'dark' },
      ]}
    />
  );
}
