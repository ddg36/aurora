import { getJSON, postJSON } from '../../../components/shared/api.js';

export const EDITOR_ROOT = 'nexus/workspaces/aihub';

export async function listar(path = EDITOR_ROOT) {
  const out = await getJSON(`/nexus/fs/list?path=${encodeURIComponent(path)}`);
  return out.entries || [];
}

export async function leer(path) {
  const out = await getJSON(`/nexus/fs/read?path=${encodeURIComponent(path)}`);
  return out.content || '';
}

export function escribir(path, content) {
  return postJSON('/nexus/fs/write', { path, content });
}

export function detectarLang(nombre) {
  if (/\.py$/.test(nombre)) return 'py';
  if (/\.(js|mjs)$/.test(nombre)) return 'js';
  if (/\.sh$/.test(nombre)) return 'sh';
  return null;
}

export function ejecutar(lang, code, timeout = 30) {
  return postJSON('/nexus/editor/run', { lang, code, timeout });
}
