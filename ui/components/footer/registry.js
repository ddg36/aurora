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
  { id: 'usuario', icon: 'user', title: 'Cambiar usuario', onClick: () => { userSwitcherAbierto.value = true; } },
  { id: 'notif', icon: 'bell', title: 'Notificaciones', onClick: () => { notifAbierto.value = true; } },
  { id: 'theme-mode', icon: 'moon', title: 'Alternar modo de color', active: () => themeMode.value === 'light', onClick: toggleThemeMode },
  ...ACCIONES_CAPTURA_RAPIDA,
  // location.reload() solo no alcanza para un hard reload real: los
  // navegadores modernos ya no honran el viejo location.reload(true), y con
  // Cache-Control:max-age=60 en el server, un reload normal puede seguir
  // sirviendo assets cacheados dentro de esa ventana. El query param único
  // fuerza que ESTA navegación puntual sea tratada como URL nueva (bypass
  // real de caché), igual que el botón de retry de la extensión Aurora Hub.
  {
    id: 'reload', icon: 'refresh', title: 'Recargar Aurora (hard reload)',
    onClick: () => {
      const url = new URL(location.href);
      url.searchParams.set('_r', Date.now());
      location.href = url.toString();
    },
  },
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
