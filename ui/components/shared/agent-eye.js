// Store global del Agent Eye — signals + suscripción al bus /eventos.
// Vive en shared/ (no en un módulo) a propósito: la suscripción corre
// desde boot.js una sola vez, así el estado del agente existe y se
// actualiza sin importar qué tab esté activa. El panel (components/
// agent-eye/) solo lee estas signals; ningún módulo es dueño de esto.

import { onEvento } from './eventos-ws.js';
import { postJSON } from './api.js';

const signal = globalThis.signal;

export const agenteEstado = signal('idle');    // idle|corriendo|pausado|fin|error
export const agentePasos = signal([]);         // [{tipo, mensaje, url, ts}] — últimos 50
export const agenteCapturaN = signal(0);       // bump => el panel re-fetchea la captura
export const agenteAbierto = signal(false);    // panel desplegado
export const agenteNoVisto = signal(false);    // actividad con el panel cerrado (badge)

let iniciado = false;

export function initAgentEye() {
  if (iniciado) return;
  iniciado = true;
  onEvento('browser', (d) => {
    if (d.tipo === 'captura') { agenteCapturaN.value = d.n; return; }
    if (d.tipo === 'control') {
      if (d.accion === 'pause') agenteEstado.value = 'pausado';
      if (d.accion === 'resume') agenteEstado.value = 'corriendo';
      return;
    }
    if (d.tipo === 'inicio') {
      agentePasos.value = [];
      agenteCapturaN.value = 0;
      agenteEstado.value = 'corriendo';
      agenteAbierto.value = true;
    } else if (d.tipo === 'fin') {
      agenteEstado.value = 'fin';
    } else if (d.tipo === 'error') {
      agenteEstado.value = 'error';
    }
    agentePasos.value = [...agentePasos.value.slice(-49), { ...d, ts: Date.now() }];
    if (!agenteAbierto.value) agenteNoVisto.value = true;
  });
}

export function controlarAgente(accion) {
  return postJSON('/tools/browser_task/control', { accion }).catch(() => {});
}
