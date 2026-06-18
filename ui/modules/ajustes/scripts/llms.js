import { signal } from '../../../store.js';
import { getJSON, postJSON, deleteJSON } from '../../../components/shared/api.js';

export const llms = signal([]);

export async function cargarLLMs() {
  try {
    llms.value = await getJSON('/db/urls-custom');
  } catch {
    llms.value = [];
  }
}

export async function crearLLM(nombre, url) {
  let icono = null;
  try {
    icono = new URL(url).origin + '/favicon.ico';
  } catch {}
  await postJSON('/db/urls-custom', { nombre, url, icono });
  await cargarLLMs();
}

export async function borrarLLM(id) {
  await deleteJSON(`/db/urls-custom/${id}`);
  await cargarLLMs();
}
