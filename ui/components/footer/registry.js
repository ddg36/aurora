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

// SVG monocromo (currentColor, viewBox 14x14) — mismo lenguaje visual que
// los íconos del riel de NavBar (nav-tabs.js), en vez de emoji a color
// (👤🔔 rompían la consistencia con el resto de los botones del Footer).
const SVG_USUARIO = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="4.2" r="2.4"/><path d="M2 12.5c0-2.8 2.2-5 5-5s5 2.2 5 5"/></svg>';
const SVG_NOTIF = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 1.5c-1.8 0-3 1.5-3 3.5v2.3c0 .7-.3 1.4-.8 1.9L2.5 10h9l-.7-.8c-.5-.5-.8-1.2-.8-1.9V5c0-2-1.2-3.5-3-3.5z"/><path d="M5.5 12a1.5 1.5 0 003 0"/></svg>';

const ACCIONES_GLOBAL = [
  { id: 'usuario', svg: SVG_USUARIO, title: 'Cambiar usuario', onClick: () => { userSwitcherAbierto.value = true; } },
  { id: 'notif', svg: SVG_NOTIF, title: 'Notificaciones', onClick: () => { notifAbierto.value = true; } },
  { id: 'theme-mode', icon: '◐', title: 'Modo oscuro/blanco', active: () => themeMode.value === 'light', onClick: toggleThemeMode },
  ...ACCIONES_CAPTURA_RAPIDA,
  // location.reload() solo no alcanza para un hard reload real: los
  // navegadores modernos ya no honran el viejo location.reload(true), y con
  // Cache-Control:max-age=60 en el server, un reload normal puede seguir
  // sirviendo assets cacheados dentro de esa ventana. El query param único
  // fuerza que ESTA navegación puntual sea tratada como URL nueva (bypass
  // real de caché), igual que el botón de retry de la extensión Aurora Hub.
  {
    id: 'reload', icon: '↺', title: 'Recargar Aurora (hard reload)',
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
