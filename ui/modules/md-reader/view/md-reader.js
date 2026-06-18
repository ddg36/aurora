const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useMemo, useRef } = globalThis.preactHooks;

import { MD_ROOT, asegurarRaiz, listarMarkdown, leerArchivosMarkdown, leer, escribir, crearMissingNote, listar, crearDir, abrirEnExplorador, stat } from '../scripts/fs.js';
import { setViewActions, clearViewActions } from '../../../components/footer/registry.js';
import { sendToGemita } from '../../../components/shared/gemita-ws.js';
import { Toast } from '../../../components/shared/toast.js';
import { putJSON } from '../../../components/shared/api.js';
import { Button } from '../../../components/Button.js';
import { Chip } from '../../../components/Chip.js';
import { Empty } from '../../../components/Empty.js';
import { Input, Select, Textarea } from '../../../components/Input.js';
import { getPrefs, savePrefs, saveIndex, loadIndex } from '../scripts/db.js';
import { THEMES, BACKGROUNDS } from '../../../components/themes/index.js';
import { theme, background } from '../../../store.js';
import {
  buildWorkspaceGraph,
  indexHeadings,
  makeFileIndex,
  posixDirname,
  renderGraphDetails,
  renderGraphHtml,
  renderMarkdown,
  resolveMarkdownHref,
  statsForGraph,
  joinPaths,
  posixBasename,
} from '../scripts/parser.js';

const DEFAULT_FILTERS = {
  file: true,
  heading: true,
  tag: true,
  task: true,
  'task-done': true,
  image: true,
  asset: true,
  code: true,
  table: true,
  wikilink: true,
  'markdown-link': true,
  external: true,
  missing: true,
};

const FILTER_LABELS = {
  file: 'Archivos',
  heading: 'Secciones',
  tag: 'Tags',
  task: 'Tareas',
  'task-done': 'Hechas',
  image: 'Imágenes',
  asset: 'Assets',
  code: 'Código',
  table: 'Tablas',
  wikilink: 'Wikilinks',
  'markdown-link': 'Links',
  external: 'Externos',
  missing: 'Faltantes',
};

const MODE_TABS = [
  { id: 'read', label: 'Leer' },
  { id: 'doc', label: 'Mapa doc' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'tasks', label: 'Tareas' },
  { id: 'search', label: 'Buscar' },
];

function normalizeImportRelativePath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(part => part && part !== '.' && part !== '..')
    .join('/');
}

function uniqueImportTarget(target, usedTargets) {
  const normalized = normalizeImportRelativePath(target);
  const key = normalized.toLowerCase();
  if (!usedTargets.has(key)) {
    usedTargets.add(key);
    return normalized;
  }
  const dir = posixDirname(normalized);
  const base = posixBasename(normalized).replace(/\.md$/i, '');
  let index = 1;
  let next = '';
  do {
    next = joinPaths(dir, `${base}-${index}.md`);
    index += 1;
  } while (usedTargets.has(next.toLowerCase()));
  usedTargets.add(next.toLowerCase());
  return next;
}

function clsx(...items) {
  return items.filter(Boolean).join(' ');
}

const STAT_TONES = {
  blue: 'rgba(56, 189, 248, 0.35)',
  green: 'rgba(34, 197, 94, 0.35)',
  red: 'rgba(244, 63, 94, 0.35)',
  violet: 'rgba(139, 92, 246, 0.35)',
};

function toneStyle(tone) {
  return tone ? `border-color:${STAT_TONES[tone] || 'var(--aurora-border)'}` : '';
}

function isMarkdownFile(file) {
  return /\.md$/i.test(file.name);
}

function relativeToRoot(path, root) {
  if (!path) return '';
  const cleanRoot = String(root || '').replace(/\/+$/, '');
  return String(path).startsWith(`${cleanRoot}/`) ? String(path).slice(cleanRoot.length + 1) : String(path);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('es');
}

function documentStats(content, rendered, docGraph) {
  const text = String(content || '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const lines = content ? String(content).split('\n').length : 0;
  const nodes = docGraph?.nodes || [];
  const edges = docGraph?.edges || [];
  return {
    words,
    lines,
    minutes: words ? Math.max(1, Math.ceil(words / 220)) : 0,
    headings: rendered?.headings?.length || 0,
    links: edges.filter(e => ['wikilink', 'markdown-link', 'external'].includes(e.type)).length,
    tasks: nodes.filter(n => n.type === 'task' || n.type === 'task-done').length,
  };
}

function TreeBranch({ entries, nivel, abierto, onToggle, onOpen, seleccion, root }) {
  if (!entries.length) return null;
  return entries.map(entry => {
    const esDir = entry.type === 'dir';
    const selected = entry.path === seleccion;
    const rel = relativeToRoot(entry.path, root);
    const dir = rel.includes('/') ? rel.split('/').slice(0, -1).join('/') : '';
    return html`
      <div key=${entry.path}>
        <button
          type="button"
          class=${clsx('mdr-tree-row', selected && 'is-active')}
          style=${`--mdr-level:${nivel || 0}`}
          onClick=${() => esDir ? onToggle(entry.path) : onOpen(entry.path)}
        >
          <span class="mdr-tree-icon">${esDir ? (abierto[entry.path] ? '▾' : '▸') : '•'}</span>
          <span class="mdr-tree-copy">
            <span class="mdr-file-name">${entry.name}</span>
            ${dir && html`<span class="mdr-file-path">${dir}</span>`}
          </span>
        </button>
        ${esDir && abierto[entry.path] && html`
          <${TreeLoader} path=${entry.path} nivel=${nivel + 1} abierto=${abierto} onToggle=${onToggle} onOpen=${onOpen} seleccion=${seleccion} root=${root} />
        `}
      </div>
    `;
  });
}

function TreeLoader({ path, nivel, abierto, onToggle, onOpen, seleccion, root }) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    listar(path).then(setEntries).catch(() => setEntries([]));
  }, [path, abierto[path]]);
  return TreeBranch({ entries, nivel, abierto, onToggle, onOpen, seleccion, root });
}

function Stat({ label, value, tone = '' }) {
  return html`<div class="mdr-stat" style=${toneStyle(tone)}><span>${formatNumber(value)}</span><small>${label}</small></div>`;
}

function ModeButton({ active, onClick, children }) {
  return html`<button type="button" class=${clsx('mdr-mode-btn', active && 'is-active')} onClick=${onClick}>${children}</button>`;
}

function PanelSection({ title, children }) {
  return html`
    <div class="mdr-panel-section">
      <div class="mdr-section-label">${title}</div>
      <div class="mdr-section-body">${children}</div>
    </div>
  `;
}

function Pill({ label, value, tone = '' }) {
  return html`<span class=${clsx('mdr-pill', tone && `is-${tone}`)}><strong>${value}</strong>${label}</span>`;
}

export default function MDReader() {
  const params = new URLSearchParams(location.search);
  const initialRoot = params.get('path') || MD_ROOT;
  const [root, setRoot] = useState(initialRoot);
  const [files, setFiles] = useState([]);
  const [texts, setTexts] = useState(new Map());
  const [activePath, setActivePath] = useState(null);
  const [content, setContent] = useState('');
  const [rawDirty, setRawDirty] = useState(false);
  const [rendered, setRendered] = useState(null);
  const [docGraph, setDocGraph] = useState({ nodes: [], edges: [] });
  const [workspaceGraph, setWorkspaceGraph] = useState({ nodes: [], edges: [], stats: {} });
  const [abierto, setAbierto] = useState({});
  const [mode, setMode] = useState('read');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeHeading, setActiveHeading] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [treeQuery, setTreeQuery] = useState('');
  const [temaActivo, setTemaActivo] = useState(theme.value);
  const [fondoActivo, setFondoActivo] = useState(background.value);
  const [panelOpen, setPanelOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  useEffect(() => {
    asegurarRaiz().catch(() => {});
    const subs = [
      theme.subscribe(setTemaActivo),
      background.subscribe(setFondoActivo),
    ];
    getPrefs().then(prefs => {
      const urlRoot = params.get('path');
      const nextRoot = urlRoot || prefs.root_path || initialRoot;
      if (prefs.mode) setMode(prefs.mode);
      if (prefs.filters && Object.keys(prefs.filters).length) setFilters(prefs.filters);
      loadWorkspace(nextRoot, prefs.active_path || null);
    }).catch(() => loadWorkspace(initialRoot));
  }, []);

  useEffect(() => {
    setViewActions([
      { id: 'mdreader-refresh', icon: '↻', title: 'Recargar índice Markdown', onClick: () => loadWorkspace(root) },
      { id: 'mdreader-new', icon: '＋', title: 'Nueva nota', onClick: nuevaNota },
      { id: 'mdreader-save', icon: '⌁', title: 'Guardar archivo actual', onClick: guardarActual, disabled: () => !activePath || !rawDirty },
      { id: 'mdreader-edit', icon: '✎', title: 'Editar Markdown', onClick: () => setEditMode(v => !v), active: () => editMode, disabled: () => !activePath },
      { id: 'mdreader-summary', icon: '✦', title: 'Resumir con Aurora', onClick: resumirActual, disabled: () => !content.trim() || summarizing },
      { id: 'mdreader-graph', icon: '◌', title: 'Abrir grafo workspace', onClick: () => setMode('workspace') },
    ]);
    return () => clearViewActions();
  }, [root, activePath, rawDirty, editMode, content, summarizing]);

  useEffect(() => {
    savePrefs({ root_path: root, active_path: activePath, mode, filters }).catch(() => {});
  }, [root, activePath, mode, filters]);

  const visibleFiles = useMemo(() => {
    const q = treeQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f => f.path.toLowerCase().includes(q));
  }, [files, treeQuery]);

  const visibleWorkspaceNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    const types = new Set(Object.entries(filters).filter(([, v]) => v).map(([k]) => k));
    return (workspaceGraph.nodes || []).filter(n => types.has(n.type) && (!q || `${n.label} ${n.detail} ${n.path || ''}`.toLowerCase().includes(q)));
  }, [workspaceGraph, query, filters]);

  const filteredWorkspaceGraph = useMemo(() => {
    const ids = new Set(visibleWorkspaceNodes.map(n => n.id));
    return {
      nodes: visibleWorkspaceNodes,
      edges: (workspaceGraph.edges || []).filter(e => ids.has(e.from) && ids.has(e.to)),
      stats: workspaceGraph.stats || {},
    };
  }, [visibleWorkspaceNodes, workspaceGraph]);

  const taskList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (workspaceGraph.nodes || [])
      .filter(n => n.type === 'task' || n.type === 'task-done')
      .filter(n => !q || `${n.label} ${n.path || ''}`.toLowerCase().includes(q))
      .slice(0, 300);
  }, [workspaceGraph, query]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (workspaceGraph.nodes || [])
      .filter(n => `${n.label} ${n.detail} ${n.path || ''}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [workspaceGraph, query]);

  async function loadWorkspace(nextRoot = root, preferredPath = null) {
    setLoading(true);
    setMsg('Escaneando Markdown…');
    try {
      const found = await listarMarkdown(nextRoot);
      const loaded = await leerArchivosMarkdown(found);
      let graph = buildWorkspaceGraph(found, loaded, activePath);
      const cached = await loadIndex(nextRoot).catch(() => null);
      if (cached?.graph && cached.meta?.file_count === found.length) graph = cached.graph;
      const stats = statsForGraph(graph);
      const graphForDb = { ...graph, stats: { ...stats, files: found.length } };
      saveIndex(nextRoot, found, graphForDb).catch(() => {});
      setFiles(found);
      setTexts(loaded);
      setWorkspaceGraph(graph);
      setRoot(nextRoot);
      setMsg(found.length ? `Índice listo: ${found.length} archivos` : 'No se encontraron archivos .md');
      if (preferredPath && found.some(f => f.path === preferredPath)) openFile(preferredPath, loaded);
      else if (activePath && found.some(f => f.path === activePath)) openFile(activePath, loaded);
      else if (!activePath && found[0]) openFile(found[0].path, loaded);
    } catch (e) {
      setMsg('Error cargando Markdown: ' + e.message);
      Toast.show('Error cargando MD Reader', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function openFile(path, loadedTexts = texts) {
    try {
      const text = loadedTexts.has(path) ? loadedTexts.get(path) : await leer(path);
      if (!loadedTexts.has(path)) {
        const next = new Map(loadedTexts);
        next.set(path, text);
        setTexts(next);
      }
      const nextFiles = files.some(f => f.path === path) ? files : [...files, { path, name: posixBasename(path), type: 'file', size: text.length }];
      const fileIndex = makeFileIndex(nextFiles);
      const headingIndex = new Map(Array.from(loadedTexts.entries()).map(([p, t]) => [p, indexHeadings(t)]));
      if (!headingIndex.has(path)) headingIndex.set(path, indexHeadings(text));
      const parsed = renderMarkdown(text, path, fileIndex, headingIndex);
      setActivePath(path);
      setContent(text);
      setRawDirty(false);
      setRendered(parsed);
      setDocGraph(parsed.parsed);
      setSummary('');
      setEditMode(false);
      setSelectedNode(null);
      setMsg(`Leyendo ${path}`);
    } catch (e) {
      setMsg('No se pudo abrir: ' + e.message);
    }
  }

  function toggleDir(path) {
    setAbierto(prev => ({ ...prev, [path]: !prev[path] }));
  }

  function openFileDialog() {
    fileInputRef.current?.click();
  }

  function openFolderDialog() {
    folderInputRef.current?.click();
  }

  async function cambiarTema(id) {
    await putJSON('/db/ajustes/theme', { valor: id });
  }

  async function cambiarFondo(id) {
    await putJSON('/db/ajustes/background', { valor: id });
  }

  async function importFiles(fileList, isFolder = false) {
    const selected = Array.from(fileList || []).filter(isMarkdownFile);
    if (!selected.length) {
      Toast.show('No se seleccionaron archivos .md', 'warning');
      return;
    }
    setLoading(true);
    try {
      const relativePaths = selected.map(file => normalizeImportRelativePath(isFolder ? (file.webkitRelativePath || file.name) : file.name));
      const firstRelativePath = relativePaths[0] || '';
      const folderRoot = isFolder && firstRelativePath.includes('/') ? firstRelativePath.split('/')[0] : 'folder';
      const importRoot = isFolder && folderRoot
        ? joinPaths(root, 'md-reader/imports', folderRoot)
        : joinPaths(root, 'md-reader/imports');
      const usedTargets = new Set();
      const importedPaths = [];

      setMsg(`Importando ${selected.length} archivo(s) en ${importRoot}...`);
      await crearDir(importRoot);

      for (let i = 0; i < selected.length; i += 1) {
        const file = selected[i];
        const rel = relativePaths[i] || file.name;
        const relForTarget = isFolder && folderRoot && rel.startsWith(`${folderRoot}/`) ? rel.slice(folderRoot.length + 1) : rel;
        let target = uniqueImportTarget(joinPaths(importRoot, relForTarget), usedTargets);
        const existing = await stat(target).catch(() => null);
        if (existing?.ok) {
          target = uniqueImportTarget(target, usedTargets);
        }
        await escribir(target, await file.text());
        importedPaths.push(target);
      }

      Toast.show(`${selected.length} archivo(s) importado(s)`, 'success');
      await loadWorkspace(importRoot, importedPaths[0]);
    } catch (e) {
      Toast.show('Error importando archivos: ' + e.message, 'error');
      setMsg('Error importando archivos');
    } finally {
      setLoading(false);
    }
  }

  async function abrirExplorador() {
    const target = activePath || root;
    const res = await abrirEnExplorador(target);
    if (!res.ok) Toast.show(res.error || 'No se pudo abrir el explorador', 'warning');
    else Toast.show('Abriendo explorador...', 'info');
  }

  function onFilesSelected(e) {
    importFiles(e.target.files, false).finally(() => { e.target.value = ''; });
  }

  function onFolderSelected(e) {
    importFiles(e.target.files, true).finally(() => { e.target.value = ''; });
  }

  function onTreeOpen(path) {
    if (/\.md$/i.test(path)) openFile(path);
    else toggleDir(path);
  }

  async function nuevaNota() {
    const nombre = prompt('Nombre de la nota (ej: idea.md):');
    if (!nombre) return;
    const path = await crearMissingNote(nombre, root);
    await loadWorkspace(root);
    await openFile(path);
    setEditMode(true);
    Toast.show('Nota creada', 'success');
  }

  async function guardarActual() {
    if (!activePath) return;
    await escribir(activePath, content);
    setRawDirty(false);
    const fileIndex = makeFileIndex(files.length ? files : [{ path: activePath, name: posixBasename(activePath), type: 'file', size: content.length }]);
    const headingIndex = new Map(Array.from(texts.entries()).map(([p, t]) => [p, indexHeadings(t)]));
    headingIndex.set(activePath, indexHeadings(content));
    const parsed = renderMarkdown(content, activePath, fileIndex, headingIndex);
    setRendered(parsed);
    setDocGraph(parsed.parsed);
    await loadWorkspace(root);
    Toast.show('Archivo guardado', 'success');
  }

  async function toggleTask(line) {
    const lines = content.split('\n');
    const idx = Math.max(0, Number(line) - 1);
    const oldLine = lines[idx] || '';
    const nextLine = oldLine.includes('[ ]') ? oldLine.replace('[ ]', '[x]') : oldLine.replace(/\[[xX]\]/, '[ ]');
    if (nextLine === oldLine) return;
    lines[idx] = nextLine;
    const next = lines.join('\n');
    setContent(next);
    setRawDirty(true);
    await escribir(activePath, next);
    setRawDirty(false);
    const fileIndex = makeFileIndex(files.length ? files : [{ path: activePath, name: posixBasename(activePath), type: 'file', size: next.length }]);
    const headingIndex = new Map(Array.from(texts.entries()).map(([p, t]) => [p, indexHeadings(t)]));
    headingIndex.set(activePath, indexHeadings(next));
    const parsed = renderMarkdown(next, activePath, fileIndex, headingIndex);
    setRendered(parsed);
    setDocGraph(parsed.parsed);
    await loadWorkspace(root);
  }

  async function crearFaltante(target) {
    const base = activePath ? posixDirname(activePath) : root;
    const path = await crearMissingNote(target, base);
    await loadWorkspace(root);
    await openFile(path);
    setEditMode(true);
    Toast.show('Nota creada', 'success');
  }

  function handleContentClick(e) {
    const actionEl = e.target.closest('[data-md-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.mdAction;
    const line = actionEl.dataset.mdLine;
    if (action === 'toggle-task') {
      toggleTask(line);
      return;
    }
    if (action === 'jump-heading') {
      scrollToHeading(actionEl.dataset.mdHeadingId);
      return;
    }
    if (action === 'open-link') {
      const target = actionEl.dataset.mdTarget;
      const href = actionEl.dataset.mdHref;
      if (target) {
        openFile(target);
        if (actionEl.dataset.mdHeadingId) scrollToHeading(actionEl.dataset.mdHeadingId, 300);
        return;
      }
      if (href) {
        const resolved = resolveMarkdownHref(href, activePath, makeFileIndex(files));
        if (resolved.kind === 'note') openFile(resolved.uri);
        else if (resolved.kind === 'missing') crearFaltante(resolved.target || href);
        else if (resolved.kind === 'external') window.open(href, '_blank', 'noopener,noreferrer');
        else if (resolved.kind === 'anchor') scrollToHeading(actionEl.dataset.mdHeadingId || '');
      }
    }
  }

  function handleGraphClick(e) {
    const el = e.target.closest('[data-md-action="open-node"]');
    if (!el) return;
    const graphNodes = mode === 'doc' ? (docGraph.nodes || []) : (workspaceGraph.nodes || []);
    const node = graphNodes.find(n => n.id === el.dataset.mdId) || selectedNode;
    setSelectedNode(node);
    if (!node) return;
    if (node.missingTarget) {
      crearFaltante(node.missingTarget);
      return;
    }
    if (node.uri || node.path) {
      openFile(node.uri || node.path);
      if (node.type === 'heading' && node.slug) {
        const id = `md-heading-${node.slug}`;
        setTimeout(() => scrollToHeading(id), 120);
      }
    }
  }

  function scrollToHeading(id, delay = 0) {
    if (!id) return;
    setTimeout(() => {
      const host = document.getElementById('md-reader-scroll');
      const el = host?.querySelector(`#${CSS.escape(id)}`);
      el?.scrollIntoView({ block: 'start' });
      setActiveHeading(id);
    }, delay);
  }

  function onReaderScroll(e) {
    const host = e.currentTarget;
    if (!rendered?.headings?.length) return;
    let current = rendered.headings[0]?.id;
    for (const h of rendered.headings) {
      const el = host.querySelector(`#${CSS.escape(h.id)}`);
      if (el && el.offsetTop - host.scrollTop <= 90) current = h.id;
    }
    setActiveHeading(current);
  }

  function onQuickSearchKeyDown(e) {
    if (e.key === 'Enter') setMode('search');
  }

  async function resumirActual() {
    if (!content.trim() || summarizing) return;
    setSummarizing(true);
    setSummary('');
    try {
      await sendToGemita({
        message: `Resume este Markdown para Aurora MD Reader. Incluye: resumen corto, puntos clave, decisiones, tareas, preguntas abiertas y próximos pasos.\n\n${content.slice(0, 14000)}`,
        system: 'Eres Aurora MD Reader. Responde en Markdown conciso, en español, útil para lectura rápida.',
        onToken: token => setSummary(s => s + token),
      });
    } catch (e) {
      setSummary('Error generando resumen: ' + e.message);
    } finally {
      setSummarizing(false);
    }
  }

  const stats = statsForGraph(workspaceGraph);
  const docMeta = documentStats(content, rendered, docGraph);
  const activeRelative = activePath ? relativeToRoot(activePath, root) : '';
  const docTitle = rendered?.headings?.[0]?.title || (activePath ? posixBasename(activePath).replace(/\.md$/i, '') : 'Sin documento');

  const modeLabel = {
    read: 'Lectura',
    doc: 'Doc',
    workspace: 'Grafo',
    tasks: 'Tareas',
    search: 'Buscar',
  }[mode] || mode;

  return html`
    <div class=${clsx('mdr-shell', !treeOpen && 'is-sidebar-collapsed')}>
      <aside class=${clsx('mdr-sidebar', !treeOpen && 'is-hidden')}>
        <div class="mdr-sidebar-head">
          <div class="mdr-brand">
            <span class="mdr-brand-mark">M</span>
            <div>
              <strong>MD Reader</strong>
              <small>${loading ? 'Indexando' : `${formatNumber(files.length)} notas`}</small>
            </div>
          </div>
          <button type="button" class="mdr-icon-btn" title="Ocultar biblioteca" onClick=${() => setTreeOpen(false)}>‹</button>
        </div>

        <div class="mdr-sidebar-tools">
          <${Input}
            class="mdr-input"
            placeholder="Filtrar notas..."
            value=${treeQuery}
            onInput=${e => setTreeQuery(e.target.value)}
          />
          <div class="mdr-sidebar-actions">
            <${Button} size="sm" onClick=${openFileDialog}>Archivo</${Button}>
            <${Button} size="sm" onClick=${openFolderDialog}>Carpeta</${Button}>
            <${Button} size="sm" onClick=${nuevaNota}>Nueva</${Button}>
          </div>
        </div>

        <div class="mdr-file-list">
          ${visibleFiles.length === 0 && html`<${Empty} title="Sin Markdown">No hay archivos .md en esta vista.</${Empty}>`}
          <${TreeBranch} entries=${visibleFiles} nivel=${0} abierto=${abierto} onToggle=${toggleDir} onOpen=${onTreeOpen} seleccion=${activePath} root=${root} />
        </div>
      </aside>

      <section class="mdr-main">
        <header class="mdr-topbar">
          <div class="mdr-title-block">
            ${!treeOpen && html`<button type="button" class="mdr-icon-btn" title="Mostrar biblioteca" onClick=${() => setTreeOpen(true)}>›</button>`}
            <div class="mdr-doc-icon">md</div>
            <div class="mdr-doc-title">
              <span>${modeLabel}</span>
              <strong>${docTitle}</strong>
              <small>${activeRelative || msg || 'Workspace Markdown'}</small>
            </div>
          </div>
          <div class="mdr-primary-actions">
            <${Button} size="sm" variant=${rawDirty ? 'primary' : undefined} onClick=${guardarActual} disabled=${!activePath || !rawDirty}>Guardar</${Button}>
            <${Button} size="sm" active=${editMode} onClick=${() => setEditMode(v => !v)} disabled=${!activePath}>Editar</${Button}>
            <${Button} size="sm" onClick=${resumirActual} disabled=${!content.trim() || summarizing}>${summarizing ? 'Resumen...' : 'Resumen'}</${Button}>
            <button type="button" class="mdr-icon-btn" title="Ajustes" onClick=${() => setPanelOpen(true)}>⚙</button>
          </div>
          <input ref=${fileInputRef} type="file" accept=".md,text/markdown" multiple style="display:none" onChange=${onFilesSelected} />
          <input ref=${folderInputRef} type="file" webkitdirectory="" directory="" multiple style="display:none" onChange=${onFolderSelected} />
        </header>

        <div class="mdr-commandbar">
          <div class="mdr-mode-tabs">
            ${MODE_TABS.map(item => html`
              <${ModeButton} key=${item.id} active=${mode === item.id} onClick=${() => setMode(item.id)}>${item.label}</${ModeButton}>
            `)}
          </div>
          <div class="mdr-searchbox">
            <${Input}
              class="mdr-input"
              placeholder=${mode === 'workspace' ? 'Filtrar grafo...' : 'Buscar en notas...'}
              value=${query}
              onInput=${e => setQuery(e.target.value)}
              onKeyDown=${onQuickSearchKeyDown}
            />
          </div>
          <div class="mdr-command-actions">
            <${Button} size="sm" onClick=${abrirExplorador} disabled=${!activePath && !root}>Explorador</${Button}>
            <${Button} size="sm" onClick=${() => loadWorkspace(root)} disabled=${loading}>${loading ? 'Indexando...' : 'Refrescar'}</${Button}>
          </div>
        </div>

        ${panelOpen && html`
          <div class="mdr-overlay" onClick=${() => setPanelOpen(false)}></div>
          <aside class="mdr-drawer">
            <div class="mdr-drawer-head">
              <div>
                <strong>Ajustes de lectura</strong>
                <small>${loading ? 'Indexando Markdown...' : `${formatNumber(files.length)} archivos Markdown`}</small>
              </div>
              <button type="button" class="mdr-icon-btn" title="Cerrar" onClick=${() => setPanelOpen(false)}>×</button>
            </div>

            <div class="mdr-drawer-body">
              <${PanelSection} title="Modo">
                <div class="mdr-wrap">
                  ${MODE_TABS.map(item => html`
                    <${ModeButton} key=${item.id} active=${mode === item.id} onClick=${() => setMode(item.id)}>${item.label}</${ModeButton}>
                  `)}
                </div>
              </${PanelSection}>

              <${PanelSection} title="Tema y fondo">
                <div class="mdr-form-grid">
                  <label>
                    <span>Tema</span>
                    <${Select} class="text-xs" value=${temaActivo} onChange=${e => cambiarTema(e.target.value)}>
                      ${THEMES.map(t => html`<option key=${t.id} value=${t.id}>${t.name}</option>`)}
                    </${Select}>
                  </label>
                  <label>
                    <span>Fondo</span>
                    <${Select} class="text-xs" value=${fondoActivo} onChange=${e => cambiarFondo(e.target.value)}>
                      ${[{ id: 'none', name: 'Ninguno' }, ...BACKGROUNDS].map(b => html`<option key=${b.id} value=${b.id}>${b.name}</option>`)}
                    </${Select}>
                  </label>
                </div>
              </${PanelSection}>

              ${mode === 'workspace' && html`
                <${PanelSection} title="Grafo">
                  <div class="mdr-stat-grid">
                    <${Stat} label="archivos" value=${stats.files} />
                    <${Stat} label="nodos" value=${stats.nodes || filteredWorkspaceGraph.nodes.length} />
                    <${Stat} label="enlaces" value=${stats.edges || filteredWorkspaceGraph.edges.length} />
                    <${Stat} label="código" value=${stats.code} tone="blue" />
                    <${Stat} label="tablas" value=${stats.table} tone="violet" />
                    <${Stat} label="tags" value=${stats.tags} tone="violet" />
                    <${Stat} label="tareas" value=${stats.tasks} tone="green" />
                    <${Stat} label="faltantes" value=${stats.missing} tone="red" />
                    <${Stat} label="externos" value=${stats.external} tone="blue" />
                  </div>
                  <div class="mdr-wrap">
                    ${Object.keys(DEFAULT_FILTERS).map(key => html`
                      <${Chip} active=${filters[key]} onClick=${() => setFilters(f => ({ ...f, [key]: !f[key] }))}>${FILTER_LABELS[key] || key}</${Chip}>
                    `)}
                  </div>
                </${PanelSection}>
              `}

              <${PanelSection} title="Buscar">
                <${Input}
                  class="mdr-input"
                  placeholder=${mode === 'workspace' ? 'Filtrar grafo...' : 'Buscar en workspace...'}
                  value=${query}
                  onInput=${e => setQuery(e.target.value)}
                  onKeyDown=${mode === 'workspace' ? undefined : onQuickSearchKeyDown}
                />
                <div class="mdr-wrap">
                  <${Button} size="sm" onClick=${() => setMode('search')}>Resultados ${searchResults.length ? `(${searchResults.length})` : ''}</${Button}>
                  <${Button} size="sm" onClick=${() => setMode('tasks')}>Tareas ${taskList.length ? `(${taskList.length})` : ''}</${Button}>
                  <${Button} size="sm" onClick=${() => setMode('workspace')}>Grafo</${Button}>
                </div>
              </${PanelSection}>
            </div>
          </aside>
        `}

        ${mode === 'read' && rendered && html`
          <div class="mdr-reader-layout">
            <div id="md-reader-scroll" class="mdr-reader-scroll" onScroll=${onReaderScroll} onClick=${handleContentClick}>
              <article class="mdr-reader-page">
                <header class="mdr-document-head">
                  <div>
                    <span>Documento</span>
                    <strong class="mdr-document-title">${docTitle}</strong>
                    <p>${activeRelative}</p>
                  </div>
                  <div class="mdr-doc-pills">
                    <${Pill} value=${docMeta.minutes || 0} label="min" />
                    <${Pill} value=${formatNumber(docMeta.words)} label="palabras" />
                    <${Pill} value=${docMeta.headings} label="secciones" />
                    ${docMeta.tasks ? html`<${Pill} value=${docMeta.tasks} label="tareas" tone="green" />` : null}
                  </div>
                </header>

              ${editMode && html`
                <${Textarea}
                  class="mdr-editor"
                  value=${content}
                  rows=${22}
                  onInput=${e => { setContent(e.target.value); setRawDirty(true); }}
                />
              `}
                <div class="markdown-body" dangerouslySetInnerHTML=${{ __html: rendered.html }} />
              </article>
            </div>
            <aside class="mdr-outline">
              <div class="mdr-outline-head">
                <strong>Outline</strong>
                <small>${rendered.headings.length}</small>
              </div>
              ${rendered.headings.map(h => html`
                <button
                  type="button"
                  class=${clsx('mdr-outline-item', activeHeading === h.id && 'is-active')}
                  style=${`--mdr-level:${h.level}`}
                  onClick=${() => scrollToHeading(h.id)}
                >${h.title}</button>
              `)}
              ${rendered.headings.length === 0 && html`<${Empty} title="Sin outline">Este documento no tiene headings.</${Empty}>`}
            </aside>
          </div>
        `}

        ${mode === 'read' && !rendered && html`
          <div class="mdr-empty-stage">
            <${Empty} title="Sin documento abierto">No hay nota seleccionada.</${Empty}>
            <div class="mdr-wrap">
              <${Button} size="sm" onClick=${openFileDialog}>Abrir archivo</${Button}>
              <${Button} size="sm" onClick=${openFolderDialog}>Abrir carpeta</${Button}>
              <${Button} size="sm" onClick=${nuevaNota}>Nueva nota</${Button}>
            </div>
          </div>
        `}

        ${mode === 'doc' && rendered && html`
          <div class="mdr-graph-layout">
            <div class="mdr-graph-canvas" onClick=${handleGraphClick} dangerouslySetInnerHTML=${{ __html: renderGraphHtml(docGraph, { width: 900, height: 620 }) }} />
            <aside class="mdr-graph-detail" dangerouslySetInnerHTML=${{ __html: renderGraphDetails(docGraph, selectedNode?.id) }} />
          </div>
        `}

        ${mode === 'doc' && !rendered && html`
          <div class="mdr-empty-stage">
            <${Empty} title="Sin mapa">No hay nota seleccionada.</${Empty}>
          </div>
        `}

        ${mode === 'workspace' && html`
          <div class="mdr-graph-layout">
            <div class="mdr-graph-canvas" onClick=${handleGraphClick} dangerouslySetInnerHTML=${{ __html: renderGraphHtml(filteredWorkspaceGraph, { width: 980, height: 640 }) }} />
            <aside class="mdr-graph-detail" dangerouslySetInnerHTML=${{ __html: renderGraphDetails(filteredWorkspaceGraph, selectedNode?.id) }} />
          </div>
        `}

        ${mode === 'tasks' && html`
          <div class="mdr-list-view">
            <div class="mdr-list-head">
              <div>
                <strong>Tareas</strong>
                <small>${formatNumber(taskList.length)} detectadas</small>
              </div>
            </div>
            ${taskList.length === 0 && html`<${Empty} title="Sin tareas">No hay checklists detectados.</${Empty}>`}
            ${taskList.map(task => html`
              <button type="button" class=${clsx('mdr-result-row', task.type === 'task-done' && 'is-done')} onClick=${() => { openFile(task.path); setMode('read'); }}>
                <span class="mdr-task-box">${task.type === 'task-done' ? '✓' : ''}</span>
                <span>
                  <strong>${task.label}</strong>
                  <small>${relativeToRoot(task.path, root)}${task.line ? `:${task.line}` : ''}</small>
                </span>
              </button>
            `)}
          </div>
        `}

        ${mode === 'search' && html`
          <div class="mdr-list-view">
            <div class="mdr-list-head">
              <div>
                <strong>Resultados</strong>
                <small>${query ? `${formatNumber(searchResults.length)} coincidencias` : 'Búsqueda vacía'}</small>
              </div>
            </div>
            ${searchResults.length === 0 && html`<${Empty} title=${query ? 'Sin resultados' : 'Buscar'}>${query ? 'No hay coincidencias.' : 'Sin término activo.'}</${Empty}>`}
            ${searchResults.map(node => html`
              <button type="button" class="mdr-result-row" onClick=${() => {
                setSelectedNode(node);
                if (node.uri || node.path) {
                  openFile(node.uri || node.path);
                  setMode('read');
                  if (node.type === 'heading' && node.slug) setTimeout(() => scrollToHeading(`md-heading-${node.slug}`), 180);
                } else {
                  setMode('workspace');
                }
              }}>
                <span class="mdr-type-chip">${FILTER_LABELS[node.type] || node.type}</span>
                <span>
                  <strong>${node.label}</strong>
                  <small>${node.detail || relativeToRoot(node.path, root) || ''}</small>
                </span>
              </button>
            `)}
          </div>
        `}

        ${summary && html`
          <div class="mdr-summary">
            <div class="mdr-summary-head">
              <strong>Resumen Aurora</strong>
              <${Button} size="sm" onClick=${() => setSummary('')}>Cerrar</${Button}>
            </div>
            <div class="mdr-summary-body markdown-body" dangerouslySetInnerHTML=${{ __html: renderMarkdown(summary, 'resumen.md').html }} />
          </div>
        `}
      </section>
    </div>
  `;
}
