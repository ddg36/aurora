const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;
import { WIKI_ROOT, asegurarRaiz, listar, leer, escribir, borrar, crearDir, mover } from '../scripts/fs.js';
import { renderMarkdown } from '../../../components/shared/markdown.js';
import { crearAutosave } from '../../../components/shared/autosave.js';
import { setViewActions, clearViewActions } from '../../../components/footer/registry.js';
import { getJSON } from '../../../components/shared/api.js';
import { FileTree } from '../../../components/shared/FileTree.js';
import { SplitPane } from '../../../components/shared/SplitPane.js';
import { Button, Chip, Empty, Icon, Input } from '../../../components/index.js?v=v1-surface-convergence-1';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

export default function Wiki() {
  const [raiz, setRaiz] = useState([]);
  const [abierto, setAbierto] = useState({});
  const [archivo, setArchivo] = useState(null);
  const [contenido, setContenido] = useState('');
  const [sucio, setSucio] = useState(false);
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState(null);
  const autosave = useRef(null);

  if (!autosave.current) {
    autosave.current = crearAutosave({
      save: async (texto, { archivo }) => escribir(archivo, texto),
      canSave: ({ archivo }) => Boolean(archivo),
      onDirty: setSucio,
      onMessage: setMsg,
    });
  }

  const recargar = () => listar().then(setRaiz).catch(() => setRaiz([]));

  useEffect(() => {
    asegurarRaiz().then(recargar).catch(recargar);
  }, []);

  const toggle = (path) => setAbierto(prev => ({ ...prev, [path]: !prev[path] }));

  const abrir = async (path) => {
    setArchivo(path);
    setContenido(await leer(path));
    setSucio(false);
    setPreview(path.endsWith('.md'));
  };

  const onEdit = (texto) => {
    setContenido(texto);
    setSucio(true);
    autosave.current.schedule(texto, { archivo });
  };

  const nuevoArchivo = async () => {
    const nombre = prompt('Nombre del archivo (ej: notas.md):');
    if (!nombre) return;
    const path = `${WIKI_ROOT}/${nombre}`;
    await escribir(path, `# ${nombre.replace(/\.md$/, '')}\n\n`);
    await recargar();
    abrir(path);
  };

  const nuevaCarpeta = async () => {
    const nombre = prompt('Nombre de la carpeta:');
    if (!nombre) return;
    await crearDir(`${WIKI_ROOT}/${nombre}`);
    recargar();
  };

  const borrarActual = async () => {
    if (!archivo) return;
    if (!confirm(`¿Borrar ${archivo.split('/').pop()}?`)) return;
    await borrar(archivo);
    setArchivo(null);
    setContenido('');
    recargar();
  };

  const renombrar = async () => {
    if (!archivo) return;
    const nuevo = prompt('Nuevo nombre:', archivo.split('/').pop());
    if (!nuevo) return;
    const destino = archivo.split('/').slice(0, -1).join('/') + '/' + nuevo;
    await mover(archivo, destino);
    setArchivo(destino);
    recargar();
  };

  const buscar = async (texto) => {
    const t = (texto ?? query).trim();
    if (!t) { setResultados(null); return; }
    try {
      const r = await getJSON(`/db/wiki/grep?q=${encodeURIComponent(t)}`);
      setResultados(r);
    } catch {
      setResultados([]);
    }
  };

  const abrirResultado = (relPath) => {
    setBuscando(false);
    setResultados(null);
    abrir(`${WIKI_ROOT}/${relPath}`);
  };

  useEffect(() => {
    setViewActions([
      { id: 'wiki-nuevo', icon: 'file-text', title: 'Nuevo archivo', onClick: nuevoArchivo },
      { id: 'wiki-carpeta', icon: 'folder', title: 'Nueva carpeta', onClick: nuevaCarpeta },
      { id: 'wiki-buscar', icon: 'search', title: 'Buscar en wiki', onClick: () => setBuscando(b => !b), active: () => buscando },
      { id: 'wiki-preview', icon: 'eye', title: 'Alternar vista previa', onClick: () => setPreview(p => !p), active: () => preview, disabled: () => !archivo },
      { id: 'wiki-renombrar', icon: 'edit', title: 'Renombrar', onClick: renombrar, disabled: () => !archivo },
      { id: 'wiki-borrar', icon: 'trash', title: 'Borrar', onClick: borrarActual, disabled: () => !archivo },
    ]);
    return () => clearViewActions();
  }, [archivo, preview, buscando]);

  useEffect(() => registerAIView({
    id: 'wiki',
    description: 'Base de conocimiento editable en archivos, distinta del lector documental MD.',
    actions: {
      status: { description: 'Resume documento y modo visual actuales.', readOnly: true, run: () => ({ root: WIKI_ROOT, file: archivo, dirty: sucio, preview, chars: contenido.length, searching: buscando }) },
      list_files: { description: 'Lista el árbol raíz de conocimiento.', readOnly: true, run: async () => listar() },
      read: { description: 'Lee un archivo de Wiki sin cambiar la interfaz.', input: { path: { type: 'string', required: true, maxLength: 1000 } }, readOnly: true, run: async ({ path }) => ({ path, content: await leer(path) }) },
      open: { description: 'Abre un archivo existente en Wiki.', input: { path: { type: 'string', required: true, maxLength: 1000 } }, run: async ({ path }) => { await abrir(path); return { path, opened: true }; } },
      search: { description: 'Busca texto indexado en Wiki.', input: { query: { type: 'string', required: true, maxLength: 1000 } }, readOnly: true, run: async ({ query }) => getJSON(`/db/wiki/grep?q=${encodeURIComponent(query)}`) },
    },
  }), [archivo, sucio, preview, contenido.length, buscando, raiz]);

  return html`
    <${SplitPane} className="wiki-workspace" sidebarClassName="wiki-sidebar" sidebar=${html`
        <div class="wiki-sidebar-head">
          <span><${Icon} name="book" size=${15}/><strong>Wiki</strong><small>${raiz.length} raíces</small></span>
          <${Button} icon="plus" iconOnly onClick=${nuevoArchivo} title="Nuevo archivo" />
          <${Button} icon="folder" iconOnly onClick=${nuevaCarpeta} title="Nueva carpeta" />
        </div>
        <${FileTree} entries=${raiz} abierto=${abierto} onToggle=${toggle} onOpen=${abrir} seleccion=${archivo} loadChildren=${listar} />
        ${raiz.length === 0 && html`<div class="text-xs text-white/30 p-2">Wiki vacía</div>`}
      `}>
        ${buscando && html`
          <div class="wiki-search-panel">
            <${Input} autofocus
              class="w-full"
              placeholder="Buscar en el contenido de la wiki…"
              value=${query}
              onInput=${e => { setQuery(e.target.value); buscar(e.target.value); }}
              onKeyDown=${e => e.key === 'Enter' && buscar()} />
            ${resultados && html`
              <div class="wiki-search-results">
                ${resultados.length === 0 && html`<div class="text-[11px] text-white/30 px-1">Sin resultados</div>`}
                ${resultados.map(r => html`
                  <button key=${r.path} onClick=${() => abrirResultado(r.path)}
                    class="wiki-search-result">
                    <div class="text-white/80">${r.path}</div>
                    ${r.hits.map(h => html`<div class="text-[10px] text-white/40 truncate">${h.linea}: ${h.texto}</div>`)}
                  </button>
                `)}
              </div>
            `}
          </div>
        `}
        ${archivo ? html`
          <div class="wiki-document-bar">
            <span class="wiki-document-path"><${Icon} name="file-text" size=${14}/>${archivo.replace(WIKI_ROOT + '/', '')}</span>
            <span class=${`wiki-save-state ${sucio ? 'is-dirty' : ''}`}>${sucio ? 'sin guardar' : msg || 'guardado'}</span>
            <${Chip} active=${preview} onClick=${() => setPreview(!preview)}><${Icon} name="eye" size=${14}/> Vista previa<//>
            <${Button} icon="edit" iconOnly onClick=${renombrar} title="Renombrar" />
            <${Button} icon="trash" iconOnly variant="danger" onClick=${borrarActual} title="Borrar" />
          </div>
          <div class=${`wiki-editor-grid ${preview ? 'has-preview' : ''}`}>
            <textarea
              class="wiki-source-editor"
              value=${contenido}
              onInput=${e => onEdit(e.target.value)}
              spellcheck="false"
            />
            ${preview && html`
              <div class="wiki-preview markdown-body"
                dangerouslySetInnerHTML=${{ __html: renderMarkdown(contenido) }} />
            `}
          </div>
        ` : html`
          <${Empty} icon="book" title="Wiki lista">Selecciona un archivo o crea uno nuevo.<//>
        `}
      </${SplitPane}>
  `;
}
