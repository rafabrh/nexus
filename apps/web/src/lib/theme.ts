export type ThemePref = 'light' | 'dark';

/** Tema aplicado quando não há preferência válida persistida. */
export const DEFAULT_THEME: ThemePref = 'dark';

/** String injetada inline no <head> para setar data-theme antes do paint (anti-FOUC). */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var raw = localStorage.getItem('nexus-settings');
    var pref = raw ? (JSON.parse(raw).state||{}).theme : 'dark';
    if (pref !== 'light' && pref !== 'dark') { pref = 'dark'; }
    document.documentElement.setAttribute('data-theme', pref);
  } catch(e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;
