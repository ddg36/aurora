const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;
import { EDITOR_ROOT, listar, leer, escribir, detectarLang, ejecutar } from '../scripts/runner.js';
import { setViewActions, clearViewActions } from '../../../components/footer/registry.js';
import { crearAutosave } from '../../../components/shared/autosave.js';
import { FileTree } from '../../../components/shared/FileTree.js';
import { SplitPane } from '../../../components/shared/SplitPane.js';
import { Button, Icon, Select } from '../../../components/index.js?v=v1-surface-convergence-1';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

export default function Editor() {
  const [raiz, setRaiz] = useState([]);
  const [abierto, setAbierto] = useState({});
  const [archivo, setArchivo] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [lang, setLang] = useState('py');
  const [sucio, setSucio] = useState(false);
  const [salida, setSalida] = useState(null);
  const [corriendo, setCorriendo] = useState(false);
  const [msg, setMsg] = useState('');
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
  useEffect(() => { recargar(); }, []);

  useEffect(() => registerAIView({
    id: 'editor',
    description: 'Editor y runner del sandbox de Aurora; inspecciona y abre archivos sin confundir edición visual con escritura autorizada.',
    actions: {
      status: {
        description: 'Devuelve archivo, lenguaje, suciedad, ejecución y salida actuales.',
        readOnly: true,
        run: () => ({ root: EDITOR_ROOT, archivo, lang, dirty: sucio, running: corriendo, chars: codigo.length, output: salida }),
      },
      list_files: {
        description: 'Lista el árbol raíz disponible en el sandbox.',
        readOnly: true,
        run: async () => listar(),
      },
      read: {
        description: 'Lee un archivo del sandbox sin modificar el editor.',
        input: { path: { type: 'string', required: true, maxLength: 1000 } },
        readOnly: true,
        run: async ({ path }) => ({ path, content: await leer(path) }),
      },
      open: {
        description: 'Abre un archivo del sandbox en el editor visual.',
        input: { path: { type: 'string', required: true, maxLength: 1000 } },
        run: async ({ path }) => { await abrir(path); return { path, opened: true }; },
      },
    },
  }), [archivo, lang, sucio, corriendo, codigo.length, salida, raiz]);

  const toggle = (path) => setAbierto(prev => ({ ...prev, [path]: !prev[path] }));

  const abrir = async (path) => {
    setArchivo(path);
    setCodigo(await leer(path));
    setSucio(false);
    setSalida(null);
    const l = detectarLang(path);
    if (l) setLang(l);
  };

  const onEdit = (texto) => {
    setCodigo(texto);
    setSucio(true);
    autosave.current.schedule(texto, { archivo });
  };

  const correr = async () => {
    if (corriendo || !codigo.trim()) return;
    setCorriendo(true);
    setSalida(null);
    try {
      setSalida(await ejecutar(lang, codigo));
    } catch (e) {
      setSalida({ ok: false, stderr: e.message, stdout: '', duracion_ms: 0 });
    }
    setCorriendo(false);
  };

  const nuevo = async () => {
    const nombre = prompt('Nombre del archivo (ej: script.py):');
    if (!nombre) return;
    const path = `${EDITOR_ROOT}/${nombre}`;
    await escribir(path, '');
    await recargar();
    abrir(path);
  };

  useEffect(() => {
    setViewActions([
      { id: 'editor-nuevo', icon: '＋', title: 'Nuevo archivo', onClick: nuevo },
      { id: 'editor-run', icon: '▶', title: 'Ejecutar', onClick: correr, disabled: () => corriendo || !codigo.trim() },
    ]);
    return () => clearViewActions();
  }, [corriendo, codigo, lang]);

  return html`
    <${SplitPane} sidebarClassName="p-2" sidebar=${html`
        <div class="flex items-center gap-1 mb-2">
          <span class="text-xs font-semibold flex-1 inline-flex items-center gap-2"><${Icon} name="code" size=${14}/> Editor</span>
          <${Button} icon="plus" iconOnly onClick=${nuevo} title="Nuevo archivo" />
        </div>
        <${FileTree} entries=${raiz} abierto=${abierto} onToggle=${toggle} onOpen=${abrir} seleccion=${archivo} loadChildren=${listar} />
        ${raiz.length === 0 && html`<div class="text-xs text-white/30 p-2">Sandbox vacío</div>`}
      `}>
        <div class="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 text-xs flex-wrap">
          <span class="text-white/60 truncate flex-1 min-w-0">${archivo ? archivo.replace(EDITOR_ROOT + '/', '') : 'sin archivo (modo scratch)'}</span>
          <span class="text-white/30">${sucio ? '● sin guardar' : msg}</span>
          <${Select} size="sm" value=${lang} onChange=${e => setLang(e.target.value)}>
            <option value="py">python</option>
            <option value="js">node</option>
            <option value="sh">bash</option>
          <//>
          <${Button} icon="play" size="sm" variant="primary"
            onClick=${correr}
            disabled=${corriendo || !codigo.trim()}
          >${corriendo ? 'Ejecutando…' : 'Ejecutar'}<//>
        </div>

        <textarea
          class="flex-1 bg-transparent p-3 text-xs font-mono outline-none resize-none text-white/80 min-h-0"
          placeholder="Escribí código acá y ejecutalo en el sandbox…"
          value=${codigo}
          onInput=${e => onEdit(e.target.value)}
          spellcheck="false"
        />

        ${salida && html`
          <div class="border-t border-white/10 p-2 max-h-56 overflow-y-auto text-xs font-mono shrink-0">
            <div class="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider">
              <span class=${salida.ok ? 'text-emerald-400' : 'text-red-400'}>${salida.ok ? '✓ exit 0' : `✗ exit ${salida.code ?? '?'}`}</span>
              <span class="text-white/30">${salida.duracion_ms} ms</span>
            </div>
            ${salida.stdout && html`<pre class="whitespace-pre-wrap text-white/80">${salida.stdout}</pre>`}
            ${salida.stderr && html`<pre class="whitespace-pre-wrap text-red-300/80">${salida.stderr}</pre>`}
            ${!salida.stdout && !salida.stderr && html`<div class="text-white/30">(sin salida)</div>`}
          </div>
        `}
      </${SplitPane}>
  `;
}
