const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;
import { EDITOR_ROOT, listar, leer, escribir, detectarLang, ejecutar } from '../scripts/runner.js';
import { setViewActions, clearViewActions } from '../../../components/footer/registry.js';
import { crearAutosave } from '../../../components/shared/autosave.js';
import { FileTree } from '../../../components/shared/FileTree.js';

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
    <div class="flex h-full">
      <aside class="w-56 border-r border-white/5 p-2 overflow-y-auto shrink-0">
        <div class="flex items-center gap-1 mb-2">
          <span class="text-xs font-semibold flex-1">⌨ Editor</span>
          <button onClick=${nuevo} title="Nuevo archivo" class="text-xs px-1.5 rounded hover:bg-white/10">＋</button>
        </div>
        <${FileTree} entries=${raiz} abierto=${abierto} onToggle=${toggle} onOpen=${abrir} seleccion=${archivo} loadChildren=${listar} />
        ${raiz.length === 0 && html`<div class="text-xs text-white/30 p-2">Sandbox vacío</div>`}
      </aside>

      <div class="flex-1 flex flex-col min-w-0">
        <div class="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 text-xs">
          <span class="text-white/60 truncate flex-1">${archivo ? archivo.replace(EDITOR_ROOT + '/', '') : 'sin archivo (modo scratch)'}</span>
          <span class="text-white/30">${sucio ? '● sin guardar' : msg}</span>
          <select class="bg-white/5 rounded px-1.5 py-0.5 outline-none" value=${lang} onChange=${e => setLang(e.target.value)}>
            <option value="py">python</option>
            <option value="js">node</option>
            <option value="sh">bash</option>
          </select>
          <button
            onClick=${correr}
            disabled=${corriendo || !codigo.trim()}
            class="px-3 py-0.5 rounded font-semibold disabled:opacity-40"
            style="background:var(--au-accent,#8b5cf6)"
          >${corriendo ? '…' : '▶ Ejecutar'}</button>
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
      </div>
    </div>
  `;
}
