import { BASE, getJSON, hdrs, putJSON } from '../../../components/shared/api.js';
import { nexusOnline, signal } from '../../../store.js';
import { copiarTexto, leerTexto } from '../../../components/shared/clipboard.js';

const ARCHIVO = 'scratchpad.md';
const STORAGE_PATH = '/db/ajustes/scratchpad_doc';
const DOC_VERSION = 1;
const AUTOSAVE_MS = 1500;
const FALLBACK_WORKSPACE = '/media/almacen/deml/Downloads/core_instruction';
const SAVE_MARKER = 'aurora-scratchpad-json:v1';

export const NOTAS_ROOT = 'scratchpad';
export const doc = signal(defaultDoc());
export const DEFAULT_DOC = defaultDoc;

let _timer = null;
let _saveStatus = 'idle';
let _loaded = false;
let _workspaceRoot = null;
const _listeners = new Set();

export function idGen() {
  return Math.random().toString(36).slice(2, 9);
}

function uid(prefix = 'sp') {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${idGen()}${idGen()}`;
  return `${prefix}_${String(rand).replace(/-/g, '').slice(0, 12)}`;
}

function now() {
  return Date.now();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlain(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function base() {
  return globalThis.__AURORA_BASE__ || BASE;
}

function headers(extra = {}) {
  return {
    ...(hdrs() || { 'Content-Type': 'application/json' }),
    ...extra,
  };
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(/^https?:\/\//.test(url) ? url : `${base()}${url}`, {
    ...options,
    headers: headers(options.headers || {}),
  });
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${url} failed ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function createBaseBlock(type = 'paragraph', patch = {}) {
  const base = { id: uid('block'), type, text: '', createdAt: now(), updatedAt: now() };

  if (type === 'todo') {
    base.checked = false;
    base.checkedItems = [];
  }
  if (type === 'toggle') {
    base.open = true;
    base.childrenText = '';
  }
  if (type === 'code') base.lang = 'text';
  if (type === 'callout') base.tone = 'info';
  if (type === 'image') {
    base.url = '';
    base.caption = '';
    base.alt = '';
  }
  if (type === 'bookmark') {
    base.url = '';
    base.title = '';
    base.description = '';
  }
  if (type === 'mini_table') {
    base.columns = ['Name', 'Status', 'Tag', 'Created'];
    base.rows = [
      { id: uid('row'), cells: ['First note', 'Draft', 'General', new Date().toLocaleDateString()] },
    ];
  }
  if (type === 'mini_kanban') {
    base.columns = [
      { id: uid('col'), title: 'Inbox', cards: [{ id: uid('card'), text: 'Capture idea' }] },
      { id: uid('col'), title: 'Doing', cards: [] },
      { id: uid('col'), title: 'Done', cards: [] },
    ];
  }

  return { ...base, ...patch, updatedAt: now() };
}

function defaultPage(patch = {}) {
  return {
    id: uid('page'),
    title: 'Principal',
    icon: 'SP',
    description: '',
    cover: 'study',
    createdAt: now(),
    updatedAt: now(),
    ...patch,
  };
}

function defaultDoc() {
  const page = { ...defaultPage(), blocks: [createBaseBlock('paragraph')] };
  return {
    version: DOC_VERSION,
    activePageId: page.id,
    pages: [page],
    page: pageMeta(page),
    blocks: page.blocks,
  };
}

function pageMeta(page) {
  const { blocks, ...meta } = page;
  return meta;
}

function normalizeBlock(block) {
  const next = { ...createBaseBlock(block?.type || 'paragraph'), ...(block || {}) };
  next.id ||= uid('block');
  next.type ||= 'paragraph';
  next.text ??= '';
  next.createdAt ||= now();
  next.updatedAt ||= now();

  if (next.type === 'todo') {
    next.checked = !!next.checked;
    next.checkedItems = Array.isArray(next.checkedItems) ? next.checkedItems.map(Boolean) : [];
  }
  if (next.type === 'toggle') {
    next.open = next.open !== false;
    next.childrenText ??= '';
  }
  if (next.type === 'code') next.lang ||= 'text';
  if (next.type === 'callout') next.tone ||= 'info';

  if (next.type === 'image') {
    next.url ||= '';
    next.caption ||= '';
    next.alt ||= '';
  }

  if (next.type === 'bookmark') {
    next.url ||= '';
    next.title ||= '';
    next.description ||= '';
  }

  if (next.type === 'mini_table') {
    next.columns = Array.isArray(next.columns) && next.columns.length ? next.columns : ['Name', 'Status', 'Tag', 'Created'];
    next.rows = Array.isArray(next.rows) ? next.rows.map(row => ({
      id: row.id || uid('row'),
      cells: Array.isArray(row.cells) ? row.cells : [],
    })) : [];
  }

  if (next.type === 'mini_kanban') {
    next.columns = Array.isArray(next.columns) && next.columns.length
      ? next.columns.map(col => ({
          id: col.id || uid('col'),
          title: col.title || 'Column',
          cards: Array.isArray(col.cards)
            ? col.cards.map(card => ({ id: card.id || uid('card'), text: card.text || '' }))
            : [],
        }))
      : createBaseBlock('mini_kanban').columns;
  }

  return next;
}

function normalizeDoc(raw) {
  if (!isPlain(raw)) return null;

  const fallback = defaultDoc();
  const fallbackPage = fallback.page;
  const legacyPage = {
    ...fallbackPage,
    ...(raw.page || {}),
    id: raw.page?.id || raw.activePageId || fallbackPage.id,
    updatedAt: raw.page?.updatedAt || now(),
  };

  const pages = Array.isArray(raw.pages) && raw.pages.length
    ? raw.pages.map(page => ({
        ...legacyPage,
        ...page,
        id: page.id || uid('page'),
        blocks: Array.isArray(page.blocks) && page.blocks.length
          ? page.blocks.map(normalizeBlock)
          : [createBaseBlock('paragraph')],
      }))
    : [{
        ...legacyPage,
        blocks: Array.isArray(raw.blocks) && raw.blocks.length
          ? raw.blocks.map(normalizeBlock)
          : [createBaseBlock('paragraph')],
      }];

  const activePageId = raw.activePageId && pages.some(page => page.id === raw.activePageId)
    ? raw.activePageId
    : pages[0].id;

  const active = pages.find(page => page.id === activePageId) || pages[0];

  return {
    version: DOC_VERSION,
    activePageId,
    pages,
    page: pageMeta(active),
    blocks: active.blocks,
  };
}

function withActivePage(rawDoc, updater) {
  const safe = normalizeDoc(rawDoc) || defaultDoc();
  const pages = safe.pages.map(page => page.id === safe.activePageId ? updater(page) : page);
  const active = pages.find(page => page.id === safe.activePageId) || pages[0];
  return { ...safe, pages, page: pageMeta(active), blocks: active.blocks };
}

function importMarkdown(text = '') {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let code = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, '');
    const codeStart = line.match(/^```(\w+)?/);

    if (codeStart) {
      if (code) {
        blocks.push(createBaseBlock('code', { text: code.lines.join('\n'), lang: code.lang || 'text' }));
        code = null;
      } else {
        code = { lang: codeStart[1] || 'text', lines: [] };
      }
      continue;
    }

    if (code) {
      code.lines.push(raw);
      continue;
    }

    if (!line.trim()) continue;

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push(createBaseBlock(`heading_${heading[1].length}`, { text: heading[2] }));
      continue;
    }

    const todo = line.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/);
    if (todo) {
      blocks.push(createBaseBlock('todo', { checked: todo[1].toLowerCase() === 'x', text: todo[2] }));
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      blocks.push(createBaseBlock('bullet', { text: bullet[1] }));
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      blocks.push(createBaseBlock('quote', { text: quote[1] }));
      continue;
    }

    const image = line.match(/^!\[(.*?)\]\((.*?)\)(?:\s+(.+))?$/);
    if (image) {
      blocks.push(createBaseBlock('image', { alt: image[1] || '', url: image[2] || '', caption: image[3] || '' }));
      continue;
    }

    const link = line.match(/^\[(.*?)\]\((.*?)\)$/);
    if (link) {
      blocks.push(createBaseBlock('bookmark', { title: link[1] || '', url: link[2] || '' }));
      continue;
    }

    if (/^---+$/.test(line)) {
      blocks.push(createBaseBlock('divider'));
      continue;
    }

    blocks.push(createBaseBlock('paragraph', { text: line }));
  }

  return {
    ...defaultDoc(),
    blocks: blocks.length ? blocks : [createBaseBlock('paragraph')],
  };
}

function blockToMarkdown(block) {
  const text = String(block.text || '');

  if (block.type === 'heading_1') return `# ${text}`;
  if (block.type === 'heading_2') return `## ${text}`;
  if (block.type === 'heading_3') return `### ${text}`;
  if (block.type === 'bullet') return text.split('\n').filter(Boolean).map(line => `- ${line}`).join('\n');
  if (block.type === 'todo') {
    const lines = text.split('\n').filter(line => line.length);
    if (!lines.length) return `- [${block.checked ? 'x' : ' '}]`;
    return lines.map((line, i) => `- [${block.checkedItems?.[i] ?? block.checked ? 'x' : ' '}] ${line}`).join('\n');
  }
  if (block.type === 'quote') return text.split('\n').map(line => `> ${line}`).join('\n');
  if (block.type === 'code') return `\`\`\`${block.lang || 'text'}\n${text}\n\`\`\``;
  if (block.type === 'image') return `![${block.alt || block.caption || ''}](${block.url || ''})${block.caption ? ` ${block.caption}` : ''}`;
  if (block.type === 'bookmark') return `[${block.title || block.url || 'Bookmark'}](${block.url || ''})${block.description ? `\n${block.description}` : ''}`;
  if (block.type === 'toggle') return `<details${block.open === false ? '' : ' open'}>\n<summary>${text || 'Toggle'}</summary>\n\n${block.childrenText || ''}\n</details>`;
  if (block.type === 'callout') return `> [!${String(block.tone || 'info').toUpperCase()}]\n> ${text}`;
  if (block.type === 'divider') return '---';

  if (block.type === 'mini_table') {
    const cols = Array.isArray(block.columns) && block.columns.length ? block.columns : ['Name', 'Status'];
    const rows = Array.isArray(block.rows) ? block.rows : [];
    return [
      `| ${cols.join(' | ')} |`,
      `| ${cols.map(() => '---').join(' | ')} |`,
      ...rows.map(row => `| ${cols.map((_, i) => row.cells?.[i] || '').join(' | ')} |`),
    ].join('\n');
  }

  if (block.type === 'mini_kanban') {
    return (block.columns || []).map(col => {
      const cards = (col.cards || []).map(card => `  - ${card.text || ''}`).join('\n');
      return `### ${col.title || 'Column'}\n${cards}`;
    }).join('\n\n');
  }

  return text;
}

function serializeDoc(input = doc.value) {
  const safe = normalizeDoc(input) || defaultDoc();
  return `<!-- ${SAVE_MARKER}\n${JSON.stringify(safe, null, 2)}\n-->\n\n${exportScratchpadMarkdown(safe)}`;
}

function parseSaved(content) {
  const text = String(content || '');
  const marker = new RegExp(`<!--\\s*${SAVE_MARKER}\\n([\\s\\S]*?)\\n-->`);
  const match = text.match(marker);

  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const safe = normalizeDoc(parsed);
      if (safe) return safe;
    } catch {}
  }

  return normalizeDoc(importMarkdown(text)) || defaultDoc();
}

function parseStoredDoc(value) {
  if (!value) return null;
  try {
    if (typeof value === 'string') return normalizeDoc(JSON.parse(value));
    return normalizeDoc(value);
  } catch {
    return null;
  }
}

async function loadStoredDoc() {
  try {
    const data = await getJSON(STORAGE_PATH);
    return parseStoredDoc(data?.valor ?? data?.value ?? null);
  } catch {
    return null;
  }
}

async function saveStoredDoc(input = doc.value) {
  const safe = normalizeDoc(input) || defaultDoc();
  await putJSON(STORAGE_PATH, { valor: JSON.stringify(safe) });
  return safe;
}

function emitSaveStatus(status) {
  _saveStatus = status;
  for (const cb of _listeners) {
    try { cb(status); } catch {}
  }
}

function syncLegacyScratchpadState(safe) {
  try {
    const markdown = exportScratchpadMarkdown(safe);
    const actions = globalThis.ACTIONS || {};
    const legacyStore = globalThis.store;

    if (legacyStore?.dispatch) {
      if (actions.SET_SCRATCHPAD) {
        legacyStore.dispatch({ type: actions.SET_SCRATCHPAD, payload: markdown });
      }
      if (actions.SET_SCRATCHPAD_DOC) {
        legacyStore.dispatch({ type: actions.SET_SCRATCHPAD_DOC, payload: safe });
      }
    }
  } catch {}
}

function commitDoc(next, { autosave = true } = {}) {
  const safe = normalizeDoc(next) || defaultDoc();
  doc.value = safe;
  _loaded = true;
  syncLegacyScratchpadState(safe);
  if (autosave) scheduleAutoSave();
  return safe;
}

function scheduleAutoSave() {
  clearTimeout(_timer);
  emitSaveStatus('pending');
  _timer = setTimeout(() => {
    guardarAhora().catch(() => emitSaveStatus('error'));
  }, AUTOSAVE_MS);
}

async function guardarEnWiki(input = doc.value) {
  const safe = normalizeDoc(input) || defaultDoc();
  const path = await scratchpadPath();
  await jsonFetch('/nexus/fs/write', {
    method: 'POST',
    body: JSON.stringify({
      path,
      content: serializeDoc(safe),
    }),
  });
  return path;
}

async function persistDoc(input = doc.value, { remote = true } = {}) {
  const safe = normalizeDoc(input) || defaultDoc();
  try {
    emitSaveStatus('saving');
    await saveStoredDoc(safe);

    let path = `${NOTAS_ROOT}/${ARCHIVO}`;
    if (remote && isScratchpadOnline()) {
      path = await guardarEnWiki(safe);
    }

    emitSaveStatus('ok');
    return { safe, path };
  } catch (error) {
    emitSaveStatus('error');
    throw error;
  }
}

export function getSaveStatus() {
  return _saveStatus;
}

export function onSaveStatus(cb) {
  _listeners.add(cb);
  try { cb(_saveStatus); } catch {}
  return () => _listeners.delete(cb);
}

export function getScratchpadDoc() {
  return normalizeDoc(doc.value) || defaultDoc();
}

export function isScratchpadOnline() {
  const engineState = globalThis.aurora?.state?.get?.();
  if (typeof engineState?.nexus?.online === 'boolean') return engineState.nexus.online;
  return !!nexusOnline?.value;
}

export async function getWorkspaceRoot() {
  if (_workspaceRoot) return _workspaceRoot;

  try {
    const data = await getJSON('/db/ajustes/workspace_root');
    let value = data.valor ?? data.value ?? data.workspace_root ?? '';
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'string') value = parsed;
        else if (parsed?.root) value = parsed.root;
        else if (parsed?.workspace_root) value = parsed.workspace_root;
      } catch {}
    }
    _workspaceRoot = String(value || FALLBACK_WORKSPACE);
  } catch {
    _workspaceRoot = FALLBACK_WORKSPACE;
  }

  return _workspaceRoot;
}

async function scratchpadPath() {
  const root = await getWorkspaceRoot();
  return `${String(root).replace(/\/+$/g, '')}/wiki/${ARCHIVO}`;
}

export async function cargarDoc() {
  return ensureScratchpadDoc();
}

export async function guardarDoc(input = doc.value) {
  clearTimeout(_timer);
  const safe = commitDoc(input, { autosave: false });
  const result = await persistDoc(safe);
  return result.safe;
}

export function exportarPaginaMd(page) {
  const safePage = {
    ...defaultPage({ title: 'Nota' }),
    ...(page || {}),
    blocks: Array.isArray(page?.blocks) && page.blocks.length
      ? page.blocks.map(normalizeBlock)
      : [createBaseBlock('paragraph')],
  };
  const lines = [`# ${safePage.title}`, ''];
  for (const block of safePage.blocks) {
    lines.push(blockToMarkdown(block));
  }
  return lines.join('\n');
}

export function exportScratchpadMarkdown(input = doc.value) {
  const safe = normalizeDoc(input) || defaultDoc();
  const title = safe.page?.title ? `# ${safe.page.title}\n\n` : '';
  const description = safe.page?.description ? `${safe.page.description}\n\n` : '';
  const body = (safe.blocks || [])
    .map(blockToMarkdown)
    .filter(part => String(part || '').trim().length)
    .join('\n\n');
  return `${title}${description}${body}`.trim() + '\n';
}

export function contarStats(page) {
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  const bloques = blocks.filter(block => block.type !== 'divider').length;
  const text = blocks.map(block => block.text || '').join(' ');
  const palabras = text.trim() ? text.trim().split(/\s+/).length : 0;
  const tokens = Math.ceil(text.length / 4);
  return { bloques, palabras, tokens };
}

export function descargarMd(page) {
  const content = exportarPaginaMd(page);
  const blob = new Blob([content], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${String(page?.title || 'nota').replace(/\s+/g, '-').toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function ensureScratchpadDoc() {
  if (_loaded) return getScratchpadDoc();
  _loaded = true;

  const localDoc = await loadStoredDoc();

  if (isScratchpadOnline()) {
    try {
      const path = await scratchpadPath();
      const data = await jsonFetch(`/nexus/fs/read?path=${encodeURIComponent(path)}`);
      const safe = parseSaved(data.content ?? '');
      await saveStoredDoc(safe);
      return commitDoc(safe, { autosave: false });
    } catch {}
  }

  return commitDoc(localDoc || defaultDoc(), { autosave: false });
}

export async function guardarAhora() {
  clearTimeout(_timer);
  const safe = commitDoc(doc.value, { autosave: false });
  const result = await persistDoc(safe);
  return result.path;
}

export function limpiar() {
  return commitDoc(defaultDoc());
}

export async function copiar() {
  const markdown = exportScratchpadMarkdown(doc.value);
  await copiarTexto(markdown);
  return markdown;
}

export async function pegarDesdePortapapeles() {
  const text = await leerTexto();
  if (!text) return getScratchpadDoc();
  const imported = normalizeDoc(importMarkdown(text)) || defaultDoc();
  return commitDoc(imported);
}

export function setScratchpadPage(patch = {}) {
  return commitDoc(withActivePage(doc.value, page => ({
    ...page,
    ...patch,
    updatedAt: now(),
  })));
}

export function createScratchpadPage(patch = {}) {
  const block = createBaseBlock('paragraph');
  const page = { ...defaultPage({ title: patch.title || 'Untitled' }), ...patch, blocks: [block] };
  const safe = normalizeDoc(doc.value) || defaultDoc();
  return commitDoc({
    ...safe,
    activePageId: page.id,
    pages: [...safe.pages, page],
    page: pageMeta(page),
    blocks: page.blocks,
  });
}

export function selectScratchpadPage(id) {
  const safe = normalizeDoc(doc.value) || defaultDoc();
  const active = safe.pages.find(page => page.id === id) || safe.pages[0];
  return commitDoc({
    ...safe,
    activePageId: active.id,
    page: pageMeta(active),
    blocks: active.blocks,
  }, { autosave: false });
}

export function duplicateScratchpadPage(id) {
  const safe = normalizeDoc(doc.value) || defaultDoc();
  const src = safe.pages.find(page => page.id === id) || safe.pages[0];
  const copy = {
    ...clone(src),
    id: uid('page'),
    title: `${src.title || 'Untitled'} copy`,
    createdAt: now(),
    updatedAt: now(),
    blocks: src.blocks.map(block => ({ ...clone(block), id: uid('block'), createdAt: now(), updatedAt: now() })),
  };
  return commitDoc({
    ...safe,
    activePageId: copy.id,
    pages: [...safe.pages, copy],
    page: pageMeta(copy),
    blocks: copy.blocks,
  });
}

export function deleteScratchpadPage(id) {
  const safe = normalizeDoc(doc.value) || defaultDoc();
  if (safe.pages.length <= 1) return safe;

  const pages = safe.pages.filter(page => page.id !== id);
  const active = pages.find(page => page.id === safe.activePageId) || pages[0];
  return commitDoc({
    ...safe,
    activePageId: active.id,
    pages,
    page: pageMeta(active),
    blocks: active.blocks,
  });
}

export function addScratchpadBlock(afterId = null, type = 'paragraph', patch = {}) {
  const block = createBaseBlock(type, patch);
  commitDoc(withActivePage(doc.value, page => {
    const blocks = [...(page.blocks || [])];
    const index = afterId ? blocks.findIndex(item => item.id === afterId) : -1;
    blocks.splice(index >= 0 ? index + 1 : blocks.length, 0, block);
    return { ...page, blocks, updatedAt: now() };
  }));
  return block;
}

export function updateScratchpadBlock(id, patch = {}) {
  return commitDoc(withActivePage(doc.value, page => ({
    ...page,
    blocks: page.blocks.map(block => block.id === id ? normalizeBlock({ ...block, ...patch, updatedAt: now() }) : block),
    updatedAt: now(),
  })));
}

export function deleteScratchpadBlock(id) {
  return commitDoc(withActivePage(doc.value, page => {
    const blocks = page.blocks.filter(block => block.id !== id);
    return { ...page, blocks: blocks.length ? blocks : [createBaseBlock('paragraph')], updatedAt: now() };
  }));
}

export function duplicateScratchpadBlock(id) {
  let copy = null;
  commitDoc(withActivePage(doc.value, page => {
    const blocks = [];
    for (const block of page.blocks) {
      blocks.push(block);
      if (block.id === id) {
        copy = normalizeBlock({ ...clone(block), id: uid('block'), createdAt: now(), updatedAt: now() });
        blocks.push(copy);
      }
    }
    return { ...page, blocks, updatedAt: now() };
  }));
  return copy;
}

export function moveScratchpadBlock(id, direction = 1) {
  return commitDoc(withActivePage(doc.value, page => {
    const blocks = [...page.blocks];
    const from = blocks.findIndex(block => block.id === id);
    const delta = typeof direction === 'number' ? direction : direction === 'up' ? -1 : 1;
    const to = Math.max(0, Math.min(blocks.length - 1, from + delta));
    if (from < 0 || from === to) return page;
    const [item] = blocks.splice(from, 1);
    blocks.splice(to, 0, item);
    return { ...page, blocks, updatedAt: now() };
  }));
}

export function transformScratchpadBlock(id, type = 'paragraph') {
  return commitDoc(withActivePage(doc.value, page => ({
    ...page,
    blocks: page.blocks.map(block => {
      if (block.id !== id) return block;
      return normalizeBlock({
        ...createBaseBlock(type),
        id: block.id,
        text: block.text || '',
        createdAt: block.createdAt || now(),
        updatedAt: now(),
      });
    }),
    updatedAt: now(),
  })));
}

export function updateScratchpadTable(id, patch = {}) {
  const next = Array.isArray(patch) ? { rows: patch } : patch;
  return updateScratchpadBlock(id, next || {});
}

export function updateScratchpadBoard(id, patch = {}) {
  const next = Array.isArray(patch) ? { columns: patch } : patch;
  return updateScratchpadBlock(id, next || {});
}

export function getContenido() {
  return exportScratchpadMarkdown(doc.value);
}

export function setContenido(text = '') {
  const imported = normalizeDoc(importMarkdown(String(text || ''))) || defaultDoc();
  return commitDoc(imported);
}

export function appendContenido(text = '') {
  const current = exportScratchpadMarkdown(doc.value).trim();
  const extra = String(text || '').trim();
  return setContenido([current, extra].filter(Boolean).join('\n\n'));
}

export async function asegurarRaiz() {
  await ensureScratchpadDoc();
  return NOTAS_ROOT;
}

export async function escribirNota(path, contenido) {
  const safe = await ensureScratchpadDoc();
  const title = path.split('/').pop()?.replace(/\.md$/i, '') || 'Nota';
  const imported = normalizeDoc(importMarkdown(contenido)) || defaultDoc();
  const existing = safe.pages.find(page => page.path === path);
  const blocks = imported.blocks?.length ? imported.blocks.map(normalizeBlock) : [createBaseBlock('paragraph')];
  const page = {
    ...(existing ? clone(existing) : defaultPage({ id: uid('page') })),
    title,
    path,
    blocks,
    updatedAt: now(),
    createdAt: existing?.createdAt || now(),
  };
  const pages = existing
    ? safe.pages.map(item => item.id === existing.id ? page : item)
    : [...safe.pages, page];
  const next = {
    ...safe,
    activePageId: page.id,
    pages,
    page: pageMeta(page),
    blocks: page.blocks,
  };
  commitDoc(next, { autosave: false });
  await guardarDoc(next);
  return path;
}
