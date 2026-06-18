import { getJSON } from '../../../components/shared/api.js';

export async function cargarSesiones() {
  return (await getJSON('/db/nav/sesiones')) || [];
}

export function fechaCorta(ts) {
  if (!ts) return '—';

  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  return isNaN(d)
    ? String(ts)
    : d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}
