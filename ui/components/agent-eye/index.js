// Agent Eye — panel flotante de control del agente de browser (browser_task).
// Montado a nivel App (como NotifCenter): visible desde cualquier tab.
// Lee las signals de shared/agent-eye.js; no abre WS propio.

const { h } = globalThis.preact;
const { useState, useEffect } = globalThis.preactHooks;
import {
  agenteEstado, agentePasos, agenteCapturaN, agenteAbierto, agenteNoVisto,
  controlarAgente,
} from '../shared/agent-eye.js';

const ESTADOS = {
  corriendo: { label: 'ejecutando', cls: 'text-aurora-accent' },
  pausado:   { label: 'pausado',    cls: 'text-aurora-warning' },
  fin:       { label: 'completado', cls: 'text-aurora-success' },
  error:     { label: 'error',      cls: 'text-aurora-error' },
  idle:      { label: 'inactivo',   cls: 'text-aurora-text-muted' },
};

export function AgentEye() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsubs = [agenteEstado, agentePasos, agenteCapturaN, agenteAbierto, agenteNoVisto]
      .map(s => s.subscribe(() => force(x => x + 1)));
    return () => unsubs.forEach(u => u());
  }, []);

  const estado = agenteEstado.value;
  const pasos = agentePasos.value;
  const abierto = agenteAbierto.value;

  if (!abierto && estado === 'idle' && !pasos.length) return null;

  if (!abierto) {
    return html`
      <button
        class="fixed bottom-16 right-4 z-50 w-10 h-10 rounded-full bg-aurora-surface border border-aurora-border shadow-lg cursor-pointer text-lg relative"
        title="Agent Eye — agente de browser"
        onClick=${() => { agenteAbierto.value = true; agenteNoVisto.value = false; }}
      >
        👁
        ${agenteNoVisto.value && html`<span class="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-aurora-accent" />`}
      </button>`;
  }

  const est = ESTADOS[estado] || ESTADOS.idle;
  const capturaN = agenteCapturaN.value;
  const corriendo = estado === 'corriendo';
  const pausado = estado === 'pausado';

  return html`
    <div class="fixed bottom-16 right-4 z-50 w-80 max-h-[70vh] flex flex-col rounded-lg bg-aurora-surface border border-aurora-border shadow-lg overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2 border-b border-aurora-border">
        <span>👁</span>
        <span class="text-sm font-medium text-aurora-text flex-1">Agent Eye</span>
        <span class="text-xs ${est.cls}">● ${est.label}</span>
        <button class="text-aurora-text-muted cursor-pointer" title="Cerrar"
          onClick=${() => { agenteAbierto.value = false; agenteNoVisto.value = false; }}>✕</button>
      </div>

      ${capturaN > 0 && html`
        <img
          class="w-full max-h-40 object-contain object-top bg-aurora-bg border-b border-aurora-border"
          src="${globalThis.AURORA_BASE}/tools/browser_task/captura?token=${encodeURIComponent(globalThis.AURORA_TOKEN())}&v=${capturaN}"
          alt="captura del agente"
        />`}

      <div class="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-1">
        ${pasos.length === 0 && html`<div class="text-xs text-aurora-text-muted">Sin actividad.</div>`}
        ${pasos.map(p => html`
          <div class="text-xs text-aurora-text-dim">
            <span class="text-aurora-text-muted">[${p.tipo}]</span> ${p.mensaje}
            ${p.url && html`<div class="text-aurora-text-muted truncate">${p.url}</div>`}
          </div>`)}
      </div>

      ${(corriendo || pausado) && html`
        <div class="flex gap-2 px-3 py-2 border-t border-aurora-border">
          ${corriendo && html`
            <button class="flex-1 text-xs py-1 rounded border border-aurora-border text-aurora-text cursor-pointer"
              onClick=${() => controlarAgente('pause')}>⏸ Pausar</button>`}
          ${pausado && html`
            <button class="flex-1 text-xs py-1 rounded border border-aurora-border text-aurora-text cursor-pointer"
              onClick=${() => controlarAgente('resume')}>▶ Reanudar</button>`}
          <button class="flex-1 text-xs py-1 rounded border border-aurora-border text-aurora-error cursor-pointer"
            onClick=${() => controlarAgente('abort')}>■ Abortar</button>
        </div>`}
    </div>`;
}
