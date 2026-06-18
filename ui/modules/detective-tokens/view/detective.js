const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;
import { estimar, guardarAnalisis, cargarHistorial } from '../scripts/analizar.js';
import { crearAutosave } from '../../../components/shared/autosave.js';

export default function DetectiveTokens() {
  const [texto, setTexto] = useState('');
  const [historial, setHistorial] = useState([]);
  const [msg, setMsg] = useState('');
  const autosave = useRef(null);

  const est = estimar(texto);

  const recargar = () => cargarHistorial().then(h => setHistorial(h || [])).catch(() => {});

  if (!autosave.current) {
    autosave.current = crearAutosave({
      delay: 2000,
      save: async (texto) => guardarAnalisis(texto, estimar(texto)),
      canSave: ({ texto }) => Boolean(texto?.trim().length > 20),
      onSaved: recargar,
      onMessage: (m) => setMsg(m === 'guardado' ? 'análisis guardado' : m),
    });
  }

  useEffect(() => { recargar(); }, []);

  const onInput = (e) => {
    const t = e.target.value;
    setTexto(t);
    autosave.current.schedule(t, { texto: t });
  };

  return html`
    <div class="max-w-3xl mx-auto p-4">
      <h1 class="text-lg font-semibold mb-1">🔍 Detective de Tokens</h1>
      <p class="text-xs text-white/40 mb-3">Estimación rápida (~4 chars/token + ajustes por CJK y símbolos de código)</p>

      <textarea
        class="w-full h-40 bg-white/5 rounded-lg p-3 text-xs font-mono outline-none resize-y text-white/80"
        placeholder="Pegá texto acá para estimar tokens…"
        value=${texto}
        onInput=${onInput}
        spellcheck="false"
      />

      <div class="flex gap-2 mt-2 mb-4 text-center">
        <div class="flex-1 bg-white/5 rounded-lg p-2">
          <div class="text-lg font-semibold" style="color:var(--au-accent,#8b5cf6)">${est.tokens}</div>
          <div class="text-[10px] uppercase tracking-wider text-white/40">tokens est.</div>
        </div>
        <div class="flex-1 bg-white/5 rounded-lg p-2">
          <div class="text-lg font-semibold">${est.chars}</div>
          <div class="text-[10px] uppercase tracking-wider text-white/40">caracteres</div>
        </div>
        <div class="flex-1 bg-white/5 rounded-lg p-2">
          <div class="text-lg font-semibold">${est.palabras}</div>
          <div class="text-[10px] uppercase tracking-wider text-white/40">palabras</div>
        </div>
        <div class="flex-1 bg-white/5 rounded-lg p-2">
          <div class="text-lg font-semibold">${est.chars > 0 ? (est.chars / Math.max(1, est.tokens)).toFixed(1) : '—'}</div>
          <div class="text-[10px] uppercase tracking-wider text-white/40">chars/token</div>
        </div>
      </div>

      <div class="text-[11px] text-white/40 mb-4">
        base ${est.breakdown.base} · CJK ${est.breakdown.cjk} · símbolos código ${est.breakdown.simbolos_codigo}
        <span class="ml-2 text-emerald-400/60">${msg}</span>
      </div>

      <h2 class="text-xs uppercase tracking-widest text-white/40 mb-2">Historial de análisis</h2>
      ${historial.length === 0 && html`<div class="text-xs text-white/30">Sin análisis guardados</div>`}
      ${historial.map(h => html`
        <div key=${h.texto_hash} class="flex items-center gap-3 text-xs py-1 border-b border-white/5">
          <code class="text-white/40">${h.texto_hash}</code>
          <span class="flex-1" />
          <span class="text-white/60">${h.chars} chars</span>
          <span style="color:var(--au-accent,#8b5cf6)">${h.tokens_est} tokens</span>
        </div>
      `)}
    </div>
  `;
}
