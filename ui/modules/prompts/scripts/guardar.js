import { signal } from '../../../store.js';
import { getJSON, postJSON, patchJSON, deleteJSON } from '../../../components/shared/api.js';

export const prompts = signal([]);
export const cargandoPrompts = signal(false);

export async function cargarPrompts() {
  cargandoPrompts.value = true;
  try {
    prompts.value = await getJSON('/db/prompts');
  } catch {
    prompts.value = [];
  } finally {
    cargandoPrompts.value = false;
  }
}

export async function guardarPrompt(data) {
  const out = await postJSON('/db/prompts', data);
  await cargarPrompts();
  return out;
}

export async function borrarPrompt(id) {
  await deleteJSON(`/db/prompts/${id}`);
  await cargarPrompts();
}

export async function toggleFavorito(id) {
  await patchJSON(`/db/prompts/${id}/favorito`);
  await cargarPrompts();
}

export async function registrarUso(id) {
  await patchJSON(`/db/prompts/${id}/uso`);
}

export async function addHistorial(contenido, nombre, destino_ai) {
  await postJSON('/db/prompts/historial', { contenido, nombre, destino_ai });
}

export async function getHistorial() {
  return getJSON('/db/prompts/historial').catch(() => []);
}

export async function clearHistorial() {
  await deleteJSON('/db/prompts/historial');
}

export async function addGuardado(contenido, nombre, tipo = 'general') {
  return postJSON('/db/prompts/guardados', { contenido, nombre, tipo });
}

export async function getGuardados() {
  return getJSON('/db/prompts/guardados').catch(() => []);
}

export async function deleteGuardado(id) {
  await deleteJSON(`/db/prompts/guardados/${id}`);
}

export function detectarVariables(texto) {
  const re = /\{\{([^}]+)\}\}/g;
  const vars = [];
  let m;
  while ((m = re.exec(texto)) !== null) {
    if (!vars.includes(m[1])) vars.push(m[1]);
  }
  return vars;
}

export function reemplazarVariables(texto, vals) {
  return texto.replace(/\{\{([^}]+)\}\}/g, (_, k) => vals[k] ?? `{{${k}}}`);
}
