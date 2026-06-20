// UI/SHARED/FS — Operaciones de filesystem compartidas (wiki, md-reader, etc.)

import { getJSON, postJSON } from './api.js';

export const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build', 'coverage', 'cloud']);

export async function asegurarRaiz(root) {
  await postJSON('/nexus/fs/mkdir', { path: root });
}

export async function listar(path) {
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

export async function stat(path) {
  const out = await getJSON(`/nexus/fs/stat?path=${encodeURIComponent(path)}`);
  return out.ok ? out : null;
}

export async function tree(path, depth = 5) {
  const out = await getJSON(`/nexus/fs/tree?path=${encodeURIComponent(path)}&depth=${depth}`);
  return out.content || '';
}
