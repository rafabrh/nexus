export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Resolve a preferência para o tema concreto a aplicar. */
export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

/**
 * Lê a preferência persistida pelo zustand persist (chave nexus-settings).
 * CONTRATO: o store usa persist({ name: 'nexus-settings' }) sem partialize,
 * então o zustand grava { "state": { ...campos, theme }, "version": N }.
 * theme PRECISA permanecer no slice persistido — não adicionar partialize
 * que o exclua, senão o anti-FOUC cai no fallback abaixo.
 */
export function readPersistedThemePref(): ThemePref {
  try {
    const raw = localStorage.getItem('nexus-settings');
    const pref = raw ? JSON.parse(raw)?.state?.theme : undefined;
    return pref === 'light' || pref === 'dark' || pref === 'system' ? pref : 'system';
  } catch {
    return 'system';
  }
}

/** String injetada inline no <head> para setar data-theme antes do paint (anti-FOUC). */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var raw = localStorage.getItem('nexus-settings');
    var pref = raw ? (JSON.parse(raw).state||{}).theme : 'system';
    if (pref !== 'light' && pref !== 'dark') {
      pref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', pref);
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;
