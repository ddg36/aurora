const html = (...args) => globalThis.html(...args);

import { instruccion, guardarInstruccion } from '../scripts/chat/instrucciones.js';

// Temperatura/top_p/ctx viven en pi y llama.cpp (settings.json / llama-server).
// Este panel solo maneja la instrucción de sistema del chat — voz TTS y
// stats de tokens viven siempre en el header (misma versión para mobile y
// escritorio, sin ramas por tamaño de pantalla).
export function ParamsPanel({ instruccionVal }) {
  return html`
    <div class="llama-params-panel px-3.5 py-2.5 text-xs">
      <div class="params-instruccion">
        <label class="block mb-1 text-[11px] text-aurora-text-dim">Instrucción de sistema</label>
        <textarea class="w-full resize-none text-[11px] bg-aurora-surface border border-aurora-border rounded text-aurora-text p-1.5" rows="3"
          placeholder="Instrucción base para el modelo…"
          value=${instruccionVal}
          onInput=${e => { instruccion.value = e.target.value; }}
          onBlur=${e => guardarInstruccion(e.target.value)}
        ></textarea>
      </div>
      <div class="mt-1.5 text-[10px] text-aurora-text-dim opacity-70">
        Muestreo (temperatura, top_p) y contexto los maneja pi + llama.cpp — /thinking y /model desde el chat.
      </div>
    </div>
  `;
}
