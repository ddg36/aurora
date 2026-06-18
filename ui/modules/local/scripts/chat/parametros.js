import { signal } from '../../../../store.js';

const BASE = globalThis.__AURORA_BASE__ || 'http://localhost:7779';
const hdrs = () => globalThis.__AURORA_HDRS__?.() || { 'Content-Type': 'application/json' };

export const params = signal({
  temperatura: 0.7,
  top_p: 0.9,
  top_k: 40,
  seed: -1,
  num_ctx: 4096,
});

export const modeloSeleccionado = signal('');

export async function cargarParametros() {
  try {
    const res = await fetch(`${BASE}/db/ajustes/local_params`, { headers: hdrs() });
    if (res.ok) {
      const data = await res.json();
      if (data.valor) params.value = JSON.parse(data.valor);
    }
  } catch {}
}

export async function guardarParametros(nuevos) {
  params.value = { ...params.value, ...nuevos };
  try {
    await fetch(`${BASE}/db/ajustes/local_params`, {
      method: 'PUT',
      headers: hdrs(),
      body: JSON.stringify({ valor: JSON.stringify(params.value) }),
    });
  } catch {}
}

export async function cargarModelo() {
  try {
    const res = await fetch(`${BASE}/db/ajustes/local_modelo`, { headers: hdrs() });
    if (res.ok) {
      const data = await res.json();
      if (data.valor) modeloSeleccionado.value = data.valor;
    }
  } catch {}
}

export async function guardarModelo(modelo) {
  modeloSeleccionado.value = modelo;
  try {
    await fetch(`${BASE}/db/ajustes/local_modelo`, {
      method: 'PUT',
      headers: hdrs(),
      body: JSON.stringify({ valor: modelo }),
    });
  } catch {}
}
