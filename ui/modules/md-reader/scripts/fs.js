import { getJSON, postJSON } from '../../../components/shared/api.js';
import { SKIP_DIRS, asegurarRaiz, listar, leer, escribir, crearDir, stat } from '../../../components/shared/fs.js';
import { posixDirname, sanitizeMissingName } from './parser.js';

export const MD_ROOT = 'nexus/workspaces/aihub';

export { SKIP_DIRS, asegurarRaiz, listar, leer, escribir, crearDir, stat };

function shellQuote(value) {
  return "'" + String(value || '').replace(/'/g, "'\\''") + "'";
}

export async function abrirEnExplorador(path = MD_ROOT) {
  const target = /\.md$/i.test(path) ? posixDirname(path) : path;
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
