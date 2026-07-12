const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;
import { WIKI_ROOT, asegurarRaiz, listar, leer, escribir, borrar, crearDir, mover } from '../scripts/fs.js';
import { renderMarkdown } from '../../../components/shared/markdown.js';
import { crearAutosave } from '../../../components/shared/autosave.js';
import { setViewActions, clearViewActions } from '../../../components/footer/registry.js';
import { getJSON } from '../../../components/shared/api.js';
import { FileTree } from '../../../components/shared/FileTree.js';
import { SplitPane } from '../../../components/shared/SplitPane.js';
import { Button, Chip } from '../../../components/index.js';

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
      { id: 'wiki-nuevo', icon: '📄', title: 'Nuevo archivo', onClick: nuevoArchivo },
      { id: 'wiki-carpeta', icon: '📁', title: 'Nueva carpeta', onClick: nuevaCarpeta },
      { id: 'wiki-buscar', icon: '🔍', title: 'Buscar en wiki', onClick: () => setBuscando(b => !b), active: () => buscando },
      { id: 'wiki-preview', icon: '👁', title: 'Toggle preview', onClick: () => setPreview(p => !p), active: () => preview, disabled: () => !archivo },
      { id: 'wiki-renombrar', icon: '✎', title: 'Renombrar', onClick: renombrar, disabled: () => !archivo },
      { id: 'wiki-borrar', icon: '🗑', title: 'Borrar', onClick: borrarActual, disabled: () => !archivo },
    ]);
    return () => clearViewActions();
  }, [archivo, preview, buscando]);

  return html`
    <${SplitPane} sidebarClassName="p-2" sidebar=${html`
        <div class="flex items-center gap-1 mb-2">
          <span class="text-xs font-semibold flex-1">📖 Wiki</span>
          <${Button} iconOnly onClick=${nuevoArchivo} title="Nuevo archivo">＋<//>
          <${Button} iconOnly onClick=${nuevaCarpeta} title="Nueva carpeta">📁<//>
        </div>
        <${FileTree} entries=${raiz} abierto=${abierto} onToggle=${toggle} onOpen=${abrir} seleccion=${archivo} loadChildren=${listar} />
        ${raiz.length === 0 && html`<div class="text-xs text-white/30 p-2">Wiki vacía</div>`}
      `}>
        ${buscando && html`
          <div class="border-b border-white/5 p-2 bg-black/20">
            <input autofocus
              class="w-full bg-black/30 border border-white/10 rounded px-2 py-1 text-xs outline-none"
              placeholder="Buscar en el contenido de la wiki…"
              value=${query}
              onInput=${e => { setQuery(e.target.value); buscar(e.target.value); }}
              onKeyDown=${e => e.key === 'Enter' && buscar()} />
            ${resultados && html`
              <div class="mt-2 max-h-48 overflow-y-auto flex flex-col gap-1">
                ${resultados.length === 0 && html`<div class="text-[11px] text-white/30 px-1">Sin resultados</div>`}
                ${resultados.map(r => html`
                  <button key=${r.path} onClick=${() => abrirResultado(r.path)}
                    class="text-left px-2 py-1 rounded hover:bg-white/5 text-xs">
                    <div class="text-white/80">${r.path}</div>
                    ${r.hits.map(h => html`<div class="text-[10px] text-white/40 truncate">${h.linea}: ${h.texto}</div>`)}
                  </button>
                `)}
              </div>
            `}
          </div>
        `}
        ${archivo ? html`
          <div class="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 text-xs">
            <span class="text-white/60 truncate flex-1">${archivo.replace(WIKI_ROOT + '/', '')}</span>
            <span class="text-white/30">${sucio ? '● sin guardar' : msg}</span>
            <${Chip} active=${preview} onClick=${() => setPreview(!preview)}>👁 preview<//>
            <${Button} iconOnly onClick=${renombrar} title="Renombrar">✎<//>
            <${Button} iconOnly variant="danger" onClick=${borrarActual} title="Borrar">🗑<//>
          </div>
          <div class="flex-1 flex flex-col md:flex-row min-h-0">
            <textarea
              class="flex-1 bg-transparent p-3 text-xs font-mono outline-none resize-none text-white/80"
              value=${contenido}
              onInput=${e => onEdit(e.target.value)}
              spellcheck="false"
            />
            ${preview && html`
              <div class="flex-1 border-t md:border-t-0 md:border-l border-white/5 p-3 overflow-y-auto text-sm"
                dangerouslySetInnerHTML=${{ __html: renderMarkdown(contenido) }} />
            `}
          </div>
        ` : html`
          <div class="flex-1 flex items-center justify-center text-white/30 text-sm">
            Seleccioná un archivo o creá uno nuevo
          </div>
        `}
      </${SplitPane}>
  `;
}
