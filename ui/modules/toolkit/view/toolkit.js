const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;
import { HERRAMIENTAS } from '../scripts/herramientas.js';
import { sendToGemita, fetchModels, cancelarMensaje } from '../../../components/shared/gemita-ws.js';
import { renderMarkdown } from '../../../components/shared/markdown.js';
import { copiarTexto } from '../../../components/shared/clipboard.js';

export default function Toolkit() {
  const [herramienta, setHerramienta] = useState(HERRAMIENTAS[0]);
  const [entrada, setEntrada] = useState('');
  const [salida, setSalida] = useState('');
  const [generando, setGenerando] = useState(false);
  const [modelos, setModelos] = useState([]);
  const [modelo, setModelo] = useState('');
  const [err, setErr] = useState('');
  const salidaRef = useRef('');

  useEffect(() => {
    fetchModels().then(ms => {
      setModelos(ms);
      if (ms.length && !modelo) setModelo(ms[0].id || ms[0]);
    });
  }, []);

  const ejecutar = async () => {
    if (!entrada.trim() || generando) return;
    setGenerando(true);
    setErr('');
    setSalida('');
    salidaRef.current = '';
    try {
      await sendToGemita({
        message: entrada,
        model: modelo,
        system: herramienta.system,
        pure_system: true,
        onToken: (t) => {
          salidaRef.current += t;
          setSalida(salidaRef.current);
        },
      });
    } catch (e) {
      setErr(e.message);
    }
    setGenerando(false);
  };

  const copiar = () => copiarTexto(salida);

  return html`
    <div class="max-w-4xl mx-auto p-4">
      <h1 class="text-lg font-semibold mb-3">🧰 Toolkit</h1>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        ${HERRAMIENTAS.map(h => html`
          <button
            key=${h.id}
            onClick=${() => setHerramienta(h)}
            class=${`text-left p-2 rounded-lg border transition
              ${herramienta.id === h.id ? 'border-white/30 bg-white/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}
          >
            <div class="text-sm">${h.icono} ${h.nombre}</div>
            <div class="text-[10px] text-white/40 mt-0.5">${h.descripcion}</div>
          </button>
        `)}
      </div>

      <textarea
        class="w-full h-32 bg-white/5 rounded-lg p-3 text-xs font-mono outline-none resize-y text-white/80"
        placeholder=${`Texto para "${herramienta.nombre}"…`}
        value=${entrada}
        onInput=${e => setEntrada(e.target.value)}
        spellcheck="false"
      />

      <div class="flex items-center gap-2 mt-2 mb-4">
        <select
          class="bg-white/5 rounded px-2 py-1 text-xs outline-none"
          value=${modelo}
          onChange=${e => setModelo(e.target.value)}
        >
          ${modelos.map(m => {
            const id = m.id || m;
            return html`<option key=${id} value=${id}>${id}</option>`;
          })}
        </select>
        <span class="flex-1" />
        ${generando && html`
          <button onClick=${cancelarMensaje} class="px-3 py-1 rounded text-xs bg-red-500/20 text-red-300 hover:bg-red-500/30">■ Cancelar</button>
        `}
        <button
          onClick=${ejecutar}
          disabled=${generando || !entrada.trim()}
          class="px-4 py-1 rounded text-xs font-semibold disabled:opacity-40"
          style="background:var(--au-accent,#8b5cf6)"
        >${generando ? 'Generando…' : `▶ ${herramienta.nombre}`}</button>
      </div>

      ${err && html`<div class="text-xs text-red-400/70 mb-2">${err}</div>`}

      ${(salida || generando) && html`
        <div class="bg-white/5 rounded-lg p-3 relative">
          <button onClick=${copiar} title="Copiar" class="absolute top-2 right-2 text-xs px-2 py-0.5 rounded hover:bg-white/10 text-white/50">⧉</button>
          <div class="text-sm pr-8" dangerouslySetInnerHTML=${{ __html: renderMarkdown(salida || '…') }} />
        </div>
      `}
    </div>
  `;
}
