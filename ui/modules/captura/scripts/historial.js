import { signal } from '../../../store.js';
import { getJSON, postJSON, deleteJSON } from '../../../components/shared/api.js';

export const historialCaptura = signal([]);

export async function cargarHistorialCaptura() {
  try {
    const rows = await getJSON('/db/ext-capturas?limit=100');
    historialCaptura.value = rows.map(r => ({
      id:      r.id,
      tipo:    r.tipo,
      title:   r.tab_title || r.titulo || '',
      url:     r.tab_url   || r.url    || '',
      content: '',
      chars:   r.chars,
      ts:      r.capturado_en * 1000,
    }));
  } catch { historialCaptura.value = []; }
}

export async function agregarAlHistorial(entrada) {
  try {
    await postJSON('/db/ext-capturas', {
      tipo:      entrada.tipo,
      titulo:    entrada.title || '',
      url:       entrada.url   || '',
      contenido: entrada.content || '',
      tab_title: entrada.title   || '',
      tab_url:   entrada.url     || '',
    });
    await cargarHistorialCaptura();
  } catch {}
}

export async function eliminarDelHistorial(id) {
  try {
    await deleteJSON(`/db/ext-capturas/${id}`);
    historialCaptura.value = historialCaptura.value.filter(it => it.id !== id);
  } catch {}
}

export async function limpiarHistorial() {
  try {
    await deleteJSON('/db/ext-capturas');
    historialCaptura.value = [];
  } catch {}
}

export async function obtenerDetalleCaptura(id) {
  try {
    const r = await getJSON(`/db/ext-capturas/${id}`);
    return {
      id:      r.id,
      tipo:    r.tipo,
      titulo:  r.titulo || '',
      url:     r.url || '',
      contenido: r.contenido || '',
      chars:   r.chars,
      ts:      r.capturado_en * 1000,
    };
  } catch { return null; }
}

export async function buscarEnHistorial(query) {
  try {
    const rows = await getJSON('/db/ext-capturas?limit=500');
    const q = query.toLowerCase();
    return rows.filter(r =>
      (r.contenido || '').toLowerCase().includes(q) ||
      (r.titulo || '').toLowerCase().includes(q) ||
      (r.url || '').toLowerCase().includes(q)
    ).map(r => ({
      id:      r.id,
      tipo:    r.tipo,
      title:   r.tab_title || r.titulo || '',
      url:     r.tab_url   || r.url    || '',
      content: r.contenido || '',
      chars:   r.chars,
      ts:      r.capturado_en * 1000,
    }));
  } catch { return []; }
}
