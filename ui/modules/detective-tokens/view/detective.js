const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;
import { estimar, guardarAnalisis, cargarHistorial } from '../scripts/analizar.js';
import { crearAutosave } from '../../../components/shared/autosave.js';
import { Textarea, ToolPage, ToolHeader, ToolSection, MetricStrip, Metric } from '../../../components/index.js?v=v1-surface-convergence-1';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

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

  useEffect(() => registerAIView({
    id: 'detective',
    description: 'Estimador local del peso de texto antes de enviarlo a un modelo.',
    actions: {
      status: { description: 'Devuelve texto, estimación e historial actuales.', readOnly: true, run: () => ({ chars: est.chars, words: est.palabras, tokens: est.tokens, breakdown: est.breakdown, saved: historial.length }) },
      estimate: { description: 'Estima tokens sin modificar la interfaz.', input: { text: { type: 'string', required: true, maxLength: 500000 } }, readOnly: true, run: ({ text }) => estimar(text) },
      inspect: { description: 'Coloca texto en Detective y devuelve su estimación.', input: { text: { type: 'string', required: true, maxLength: 500000 } }, run: ({ text }) => { setTexto(text); return estimar(text); } },
    },
  }), [est.tokens, est.chars, est.palabras, historial.length]);

  const onInput = (e) => {
    const t = e.target.value;
    setTexto(t);
    autosave.current.schedule(t, { texto: t });
  };

  return html`
    <${ToolPage}>
      <${ToolHeader} icon="search" eyebrow="Inspección" title="Detective de tokens" description="Mide el peso del texto antes de enviarlo a un modelo." />
      <${ToolSection} title="Texto a inspeccionar" description="Estimación local con ajustes para CJK y símbolos de código.">
        <${Textarea} class="w-full h-40 font-mono resize-y" placeholder="Pegá texto acá para estimar tokens…" value=${texto} onInput=${onInput} spellcheck="false" />
        <div class="text-[11px] text-white/40 mt-2">base ${est.breakdown.base} · CJK ${est.breakdown.cjk} · símbolos código ${est.breakdown.simbolos_codigo}<span class="ml-2 text-emerald-400/60">${msg}</span></div>
      <//>
      <${MetricStrip}>
        <${Metric} icon="braces" label="Tokens est." value=${est.tokens} accent />
        <${Metric} icon="file-text" label="Caracteres" value=${est.chars} />
        <${Metric} icon="note" label="Palabras" value=${est.palabras} />
        <${Metric} icon="braces" label="Chars/token" value=${est.chars > 0 ? (est.chars / Math.max(1, est.tokens)).toFixed(1) : '—'} />
      <//>
      <${ToolSection} title="Historial de análisis" meta=${`${historial.length} guardados`} flush>
        <div class="tool-history-list">
          ${historial.length === 0 && html`<div class="tool-quiet-empty">Los análisis útiles reaparecerán aquí.</div>`}
          ${historial.map(h => html`<div key=${h.texto_hash} class="tool-history-row"><code>${h.texto_hash}</code><span>${h.chars} chars</span><strong>${h.tokens_est} tokens</strong></div>`)}
        </div>
      <//>
    <//>
  `;
}
