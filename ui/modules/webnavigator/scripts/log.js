import { getJSON } from '../../../components/shared/api.js';

export const TIPO_COLOR = {
  error: 'text-red-400/80',
  warning: 'text-amber-400/80',
  accion: 'text-sky-300/80',
  nav: 'text-emerald-300/80',
};

export async function cargarLog(navSesionId = null) {
  const q = navSesionId ? `?nav_sesion_id=${navSesionId}` : '';
  return (await getJSON(`/db/nav/log${q}`)) || [];
}
