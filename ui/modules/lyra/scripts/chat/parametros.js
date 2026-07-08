import { signal } from '../../../../store.js';
import { BASE, hdrs } from '../../../../components/shared/api.js';

// Parámetros de muestreo (temperatura, top_p, ctx) viven en pi/llama.cpp — acá solo el modelo.
export const modeloSeleccionado = signal('');

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
