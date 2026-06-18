import { signal } from '../../../../store.js';

const BASE = globalThis.__AURORA_BASE__ || 'http://localhost:7779';
const hdrs = () => globalThis.__AURORA_HDRS__?.() || { 'Content-Type': 'application/json' };

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
