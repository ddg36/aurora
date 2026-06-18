const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { ejecutarCadena, PLANTILLAS } from '../scripts/ejecutar.js';
import { fetchModels, cancelarMensaje } from '../../../components/shared/gemita-ws.js';
import { renderMarkdown } from '../../../components/shared/markdown.js';

let nextId = 1;
const nuevoPaso = () => ({ id: nextId++, nombre: `Paso`, instruccion: '' });

export default function Chain() {
  const [pasos, setPasos] = useState([{ id: nextId++, nombre: 'Paso 1', instruccion: 'Resumí el texto del usuario en español.' }]);
  const [entrada, setEntrada] = useState('');
  const [salidas, setSalidas] = useState({});
  const [estado, setEstado] = useState({});
  const [corriendo, setCorriendo] = useState(false);
  const [modelos, setModelos] = useState([]);
  const [modelo, setModelo] = useState('');
  const [err, setErr] = useState('');
  const [abierto, setAbierto] = useState({});

  useEffect(() => {
    fetchModels().then(ms => {
      setModelos(ms);
      if (ms.length) setModelo(ms[0].id || ms[0]);
    });
  }, []);

  const setPaso = (id, campo, valor) =>
    setPasos(ps => ps.map(p => p.id === id ? { ...p, [campo]: valor } : p));

  const agregarPaso = () => setPasos(ps => [...ps, { ...nuevoPaso(), nombre: `Paso ${ps.length + 1}` }]);
  const quitarPaso = (id) => setPasos(ps => ps.filter(p => p.id !== id));
  const moverPaso = (i, dir) => setPasos(ps => {
    const j = i + dir;
    if (j < 0 || j >= ps.length) return ps;
    const copia = [...ps];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  });

  const cargarPlantilla = (p) => {
    setPasos(p.pasos.map(x => ({ ...x, id: nextId++ })));
    setSalidas({});
    setEstado({});
  };

  const ejecutar = async () => {
    if (!entrada.trim() || corriendo) return;
    setCorriendo(true);
    setErr('');
    setSalidas({});
    setEstado({});
    try {
      await ejecutarCadena({
        pasos,
        entrada,
        model: modelo,
        onPasoInicio: (i) => setEstado(s => ({ ...s, [i]: 'corriendo' })),
        onToken: (i, texto) => setSalidas(s => ({ ...s, [i]: texto })),
        onPasoFin: (i) => setEstado(s => ({ ...s, [i]: 'ok' })),
      });
    } catch (e) {
      setErr(e.message);
    }
    setCorriendo(false);
  };

  return html`
    <div class="max-w-4xl mx-auto p-4">
      <h1 class="text-lg font-semibold mb-1">⛓ Chain</h1>
      <p class="text-xs text-white/40 mb-3">Cadena de prompts: la salida de cada paso alimenta al siguiente</p>

      <div class="flex gap-2 mb-4 flex-wrap">
        ${PLANTILLAS.map(p => html`
          <button key=${p.nombre} onClick=${() => cargarPlantilla(p)}
            class="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60">
            ${p.nombre}
          </button>
        `)}
      </div>

      ${pasos.map((p, i) => html`
        <div key=${p.id} class="bg-white/5 rounded-lg p-2 mb-2">
          <div class="flex items-center gap-2 mb-1">
            <span class=${`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-semibold
              ${estado[i] === 'ok' ? 'bg-emerald-500/30 text-emerald-300' :
                estado[i] === 'corriendo' ? 'bg-amber-500/30 text-amber-300 animate-pulse' :
                'bg-white/10 text-white/50'}`}>${i + 1}</span>
            <input
              class="bg-transparent text-xs font-semibold outline-none flex-1"
              value=${p.nombre}
              onInput=${e => setPaso(p.id, 'nombre', e.target.value)}
            />
            <button onClick=${() => moverPaso(i, -1)} class="text-xs px-1 rounded hover:bg-white/10 text-white/40">↑</button>
            <button onClick=${() => moverPaso(i, 1)} class="text-xs px-1 rounded hover:bg-white/10 text-white/40">↓</button>
            <button onClick=${() => quitarPaso(p.id)} class="text-xs px-1 rounded hover:bg-white/10 text-red-400/60">✕</button>
          </div>
          <textarea
            class="w-full bg-black/20 rounded p-2 text-xs outline-none resize-y text-white/70 h-14"
            placeholder="Instrucción de este paso (system prompt)…"
            value=${p.instruccion}
            onInput=${e => setPaso(p.id, 'instruccion', e.target.value)}
            spellcheck="false"
          />
          ${salidas[i] != null && html`
            <div class="mt-1">
              <button onClick=${() => setAbierto(a => ({ ...a, [i]: !a[i] }))}
                class="text-[10px] text-white/40 hover:text-white/70">
                ${abierto[i] !== false ? '▾' : '▸'} salida (${(salidas[i] || '').length} chars)
              </button>
              ${abierto[i] !== false && html`
                <div class="text-xs mt-1 p-2 bg-black/30 rounded max-h-48 overflow-y-auto"
                  dangerouslySetInnerHTML=${{ __html: renderMarkdown(salidas[i]) }} />
              `}
            </div>
          `}
        </div>
      `)}

      <button onClick=${agregarPaso} class="text-xs px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-white/60 mb-4">＋ Agregar paso</button>

      <textarea
        class="w-full h-24 bg-white/5 rounded-lg p-3 text-xs font-mono outline-none resize-y text-white/80"
        placeholder="Entrada inicial de la cadena…"
        value=${entrada}
        onInput=${e => setEntrada(e.target.value)}
        spellcheck="false"
      />

      <div class="flex items-center gap-2 mt-2">
        <select class="bg-white/5 rounded px-2 py-1 text-xs outline-none" value=${modelo} onChange=${e => setModelo(e.target.value)}>
          ${modelos.map(m => {
            const id = m.id || m;
            return html`<option key=${id} value=${id}>${id}</option>`;
          })}
        </select>
        <span class="flex-1" />
        ${corriendo && html`
          <button onClick=${cancelarMensaje} class="px-3 py-1 rounded text-xs bg-red-500/20 text-red-300 hover:bg-red-500/30">■ Cancelar</button>
        `}
        <button
          onClick=${ejecutar}
          disabled=${corriendo || !entrada.trim() || pasos.length === 0}
          class="px-4 py-1 rounded text-xs font-semibold disabled:opacity-40"
          style="background:var(--au-accent,#8b5cf6)"
        >${corriendo ? 'Ejecutando…' : '▶ Ejecutar cadena'}</button>
      </div>

      ${err && html`<div class="text-xs text-red-400/70 mt-2">${err}</div>`}
    </div>
  `;
}
