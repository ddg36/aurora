import { getJSON, postJSON } from '../../../components/shared/api.js';

export const WIKI_ROOT = 'nexus/workspaces/aihub/wiki';

export async function asegurarRaiz() {
  await postJSON('/nexus/fs/mkdir', { path: WIKI_ROOT });
}

export async function listar(path = WIKI_ROOT) {
  const out = await getJSON(`/nexus/fs/list?path=${encodeURIComponent(path)}`);
  return out.entries || [];
}

export async function leer(path) {
  const out = await getJSON(`/nexus/fs/read?path=${encodeURIComponent(path)}`);
  return out.content || '';
}

export async function escribir(path, content) {
  return postJSON('/nexus/fs/write', { path, content });
}

export async function borrar(path) {
  return postJSON('/nexus/fs/delete', { path });
}

export async function crearDir(path) {
  return postJSON('/nexus/fs/mkdir', { path });
}

export async function mover(from, to) {
  return postJSON('/nexus/fs/move', { from, to });
}
