export type ThemePref = 'light' | 'dark' | 'system';

/** Tema efetivamente aplicado ao DOM (o 'system' já resolvido). */
export type ResolvedTheme = 'light' | 'dark';

/** Preferência usada quando não há valor válido persistido: segue o SO. */
export const DEFAULT_THEME: ThemePref = 'system';

/** Resolve a preferência do usuário para o tema concreto a aplicar. */
export function resolveTheme(pref: ThemePref, prefersDark: boolean): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  return prefersDark ? 'dark' : 'light';
}

/** String injetada inline no <head> para setar data-theme antes do paint (anti-FOUC). */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var raw = localStorage.getItem('nexus-settings');
    var pref = raw ? (JSON.parse(raw).state||{}).theme : 'system';
    if (pref !== 'light' && pref !== 'dark' && pref !== 'system') { pref = 'system'; }
    var resolved = pref;
    if (pref === 'system') {
      resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;
