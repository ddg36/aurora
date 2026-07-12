// Historial de sesiones de LLM cloud — host → última URL de conversación.
// ÚNICO dueño del fetch a /db/llm/history (slot 'sniffer') y de la
// suscripción al bus: llmcloud y el Cloud Backend de Lyra consumen de acá,
// así el mismo hilo se restaura en cualquier iframe que abra ese host.

import { getJSON } from './api.js';
import { onEvento } from './eventos-ws.js';

let mapa = null;      // host -> url; se mantiene vivo con eventos del bus
let promesa = null;
const subs = new Set();

export function cargarSesiones() {
  promesa ??= getJSON('/db/llm/history?slot=sniffer').then(rows => {
    mapa = {};
    for (const r of rows || []) mapa[r.ai_id] = r.url;
    onEvento('llm_history', d => {
      if (d.slot !== 'sniffer') return;
      mapa[d.ai_id] = d.url;
      for (const cb of subs) { try { cb(mapa); } catch (_) {} }
    });
    return mapa;
  }).catch(() => (mapa = {}));
  return promesa;
}

export function onSesiones(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

// Última conversación registrada para el host de urlBase; urlBase si no hay.
export async function urlRestaurada(urlBase) {
  const m = await cargarSesiones();
  try { return m[new URL(urlBase).host] || urlBase; } catch { return urlBase; }
}
