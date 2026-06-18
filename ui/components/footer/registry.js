import { signal, themeMode, setThemeMode } from '../../store.js';
import { putJSON } from '../shared/api.js';
import { ACCIONES_MODULO, ACCIONES_CAPTURA_RAPIDA } from './acciones-modulo.js';

async function toggleThemeMode() {
  const next = themeMode.value === 'light' ? 'dark' : 'light';
  setThemeMode(next);
  try { await putJSON('/db/ajustes/themeMode', { valor: next }); } catch {}
}

export const userSwitcherAbierto = signal(false);
export const notifAbierto = signal(false);

const ACCIONES_GLOBAL = [
  { id: 'usuario', icon: '👤', title: 'Cambiar usuario', onClick: () => { userSwitcherAbierto.value = true; } },
  { id: 'notif', icon: '🔔', title: 'Notificaciones', onClick: () => { notifAbierto.value = true; } },
  { id: 'theme-mode', icon: '◐', title: 'Modo oscuro/blanco', active: () => themeMode.value === 'light', onClick: toggleThemeMode },
  ...ACCIONES_CAPTURA_RAPIDA,
  { id: 'reload', icon: '↺', title: 'Recargar Aurora', onClick: () => location.reload() },
];

export const footActions = signal({ global: ACCIONES_GLOBAL, module: ACCIONES_MODULO, view: [] });

export function setViewActions(arr) {
  footActions.value = { ...footActions.value, view: Array.isArray(arr) ? arr : [] };
}

export function clearViewActions() {
  footActions.value = { ...footActions.value, view: [] };
}

export function setGlobalActions(arr) {
  footActions.value = { ...footActions.value, global: Array.isArray(arr) ? arr : [] };
}
