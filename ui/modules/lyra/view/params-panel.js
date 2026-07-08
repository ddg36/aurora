const html = (...args) => globalThis.html(...args);

import { instruccion, guardarInstruccion } from '../scripts/chat/instrucciones.js';

const Toast = () => globalThis.Toast || { show() {}, setStatus() {} };

const paramRowClass = 'param-row flex items-center gap-2';
const paramLabelClass = 'param-label w-[100px] shrink-0 text-[11px] text-aurora-text-dim';
const panelButtonClass = 'px-2 py-1 text-[11px] rounded border border-aurora-border bg-aurora-surface text-aurora-text-dim cursor-pointer hover:border-aurora-accent hover:text-aurora-text';

export function ParamsPanel({ parametrosVal, setParametro, restablecerParametros, instruccionVal, guardarParametros }) {
  return html`
    <div class="llama-params-panel shrink-0 border-b border-aurora-border bg-black bg-opacity-20 px-3.5 py-2.5 text-xs">
      <div class="params-grid flex flex-col gap-2 mb-2">
        ${[
          { clave: 'temperatura', label: 'Temperatura', min: 0, max: 2,   step: 0.05 },
          { clave: 'top_p',       label: 'Top P',       min: 0, max: 1,   step: 0.05 },
          { clave: 'top_k',       label: 'Top K',       min: 1, max: 100, step: 1    },
        ].map(({ clave, label, min, max, step }) => html`
          <label class=${paramRowClass}>
            <span class=${paramLabelClass}>${label}</span>
            <input class="flex-1" type="range" min=${min} max=${max} step=${step}
              value=${parametrosVal[clave] ?? 0.7}
              onInput=${e => setParametro(clave, e.target.value)} />
            <span class="param-val w-9 text-right text-[11px] font-semibold text-aurora-accent">${parametrosVal[clave] ?? 0.7}</span>
          </label>
        `)}
        <label class=${paramRowClass}>
          <span class=${paramLabelClass}>Seed</span>
          <input class="w-[72px]" type="number" min="-1" value=${parametrosVal.seed}
            onInput=${e => setParametro('seed', e.target.value)} />
        </label>
        <label class=${paramRowClass}>
          <span class=${paramLabelClass}>Ctx (tokens)</span>
          <input class="w-[72px]" type="number" min="512" step="512" value=${parametrosVal.num_ctx}
            onInput=${e => setParametro('num_ctx', e.target.value)} />
        </label>
      </div>
      <div class="params-actions flex gap-1.5 mb-2">
        <button class=${panelButtonClass} onClick=${() => { guardarParametros({}); Toast().setStatus('◉ Parámetros guardados'); }}>Guardar</button>
        <button class=${panelButtonClass} onClick=${restablecerParametros}>Restablecer</button>
      </div>
      <div class="params-instruccion">
        <label class="block mb-1 text-[11px] text-aurora-text-dim">Instrucción de sistema</label>
        <textarea class="w-full resize-none text-[11px] bg-aurora-surface border border-aurora-border rounded text-aurora-text p-1.5" rows="3"
          placeholder="Instrucción base para el modelo…"
          value=${instruccionVal}
          onInput=${e => { instruccion.value = e.target.value; }}
          onBlur=${e => guardarInstruccion(e.target.value)}
        ></textarea>
      </div>
    </div>
  `;
}
