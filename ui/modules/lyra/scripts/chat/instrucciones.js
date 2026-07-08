import { signal } from '../../../../store.js';
import { BASE, hdrs } from '../../../../components/shared/api.js';

export const instruccion = signal('');

export async function cargarInstruccion() {
  try {
    const res = await fetch(`${BASE}/db/ajustes/local_instruccion`, { headers: hdrs() });
    if (res.ok) {
      const data = await res.json();
      instruccion.value = data.valor || '';
    }
  } catch {}
}

export async function guardarInstruccion(texto) {
  instruccion.value = texto;
  try {
    await fetch(`${BASE}/db/ajustes/local_instruccion`, {
      method: 'PUT',
      headers: hdrs(),
      body: JSON.stringify({ valor: texto }),
    });
  } catch {}
}
