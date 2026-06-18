import { getJSON } from '../../../components/shared/api.js';

export async function cargarCapturas(navSesionId = null) {
  const q = navSesionId ? `?nav_sesion_id=${navSesionId}` : '';
  return (await getJSON(`/db/nav/capturas${q}`)) || [];
}
