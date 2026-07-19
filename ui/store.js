export const { signal, computed } = globalThis.preactSignals;

// Mirror sincrónico de la última tab (misma clave que sesion-ui.js escribe).
// activeTab arrancaba SIEMPRE en 'inicio' y solo cambiaba tras el round-trip
// async de restaurarTab() (~0.5s) — se veía el menú principal un instante
// antes de saltar a la tab real en cada boot. Leer el mirror acá, síncrono,
// antes del primer render, evita el flash (mismo patrón que usePersistedState
// usa para todo lo demás en /db/ajustes).
const TAB_MIRROR_KEY = 'aurora_ui_last_tab_mirror';
function leerTabEspejo() {
  try { return localStorage.getItem(TAB_MIRROR_KEY) || 'inicio'; } catch { return 'inicio'; }
}

export const activeTab   = signal(leerTabEspejo());
export const theme       = signal('violet');
export const themeMode   = signal('dark');
export const background  = signal('void');
export const hud         = signal('none');
export const nexusOnline = signal(false);
export const user        = signal(null);

// { id: 'aihub', extensions: ['ash','orion',...] } | null
export const extContext  = signal(null);

export const isOnline    = computed(() => nexusOnline.value);
export const enExtension = computed(() => extContext.value !== null);

export function setTab(tab) { activeTab.value = tab; }
export function setTheme(t) { theme.value = t; }
export function setThemeMode(m) { themeMode.value = m === 'light' ? 'light' : 'dark'; }
export function setBackground(b) { background.value = b; }
export function setHud(h) { hud.value = h; }
export function setExtContext(ctx) { extContext.value = ctx; }
