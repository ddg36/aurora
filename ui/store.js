export const { signal, computed } = globalThis.preactSignals;

export const activeTab   = signal('inicio');
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
