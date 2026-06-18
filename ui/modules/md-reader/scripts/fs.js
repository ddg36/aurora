import { getJSON, postJSON } from '../../../components/shared/api.js';

export const MD_ROOT = 'nexus/workspaces/aihub';

export const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build', 'coverage', 'cloud']);

export async function asegurarRaiz() {
  await postJSON('/nexus/fs/mkdir', { path: MD_ROOT });
}

export async function listar(path = MD_ROOT) {
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

export async function tree(path = MD_ROOT, depth = 5) {
  const out = await getJSON(`/nexus/fs/tree?path=${encodeURIComponent(path)}&depth=${depth}`);
  return out.content || '';
}

function dirname(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function shellQuote(value) {
  return "'" + String(value || '').replace(/'/g, "'\\''") + "'";
}

export async function abrirEnExplorador(path = MD_ROOT) {
  const target = /\.md$/i.test(path) ? dirname(path) : path;
  return postJSON('/nexus/shell/run', {
    cmd: `xdg-open ${shellQuote(target || '.')}`,
    cwd: MD_ROOT,
    timeout: 5,
  });
}

export async function listarMarkdown(raiz = MD_ROOT, maxFiles = 900) {
  const files = [];

  async function walk(path) {
    if (files.length >= maxFiles) return;
    const parts = path.split('/').filter(Boolean);
    if (parts.some(p => SKIP_DIRS.has(p))) return;

    let entries;
    try {
      entries = await listar(path);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.type === 'dir') {
        await walk(entry.path);
      } else if (/\.md$/i.test(entry.name)) {
        files.push(entry);
      }
    }
  }

  await walk(raiz);
  return files;
}

export async function leerArchivosMarkdown(files) {
  const out = new Map();
  for (const file of files) {
    try {
      out.set(file.path, await leer(file.path));
    } catch {
      out.set(file.path, '');
    }
  }
  return out;
}

export async function crearMissingNote(target, baseDir = MD_ROOT) {
  const name = sanitizeMissingName(target).replace(/\.md$/i, '') + '.md';
  const dir = baseDir || MD_ROOT;
  const path = dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
  await escribir(path, `# ${name.replace(/\.md$/i, '')}\n\n`);
  return path;
}

function sanitizeMissingName(value) {
  return String(value || 'Nueva nota')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Nueva nota';
}
