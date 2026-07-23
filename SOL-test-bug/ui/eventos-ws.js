// Cliente del bus /eventos — un solo WebSocket por tab, iniciado en boot.js.
// Observer del lado UI: los módulos se suscriben por tipo con onEvento()
// y reaccionan actualizando sus signals; nadie más abre este socket.

let ws = null;
let intento = 0;
let timer = null;

const listeners = new Map(); // tipo -> Set(cb) — '*' recibe todo

export function onEvento(tipo, cb) {
  if (!listeners.has(tipo)) listeners.set(tipo, new Set());
  listeners.get(tipo).add(cb);
  return () => listeners.get(tipo)?.delete(cb);
}

function despachar(evento) {
  for (const t of [evento.tipo, '*']) {
    for (const cb of listeners.get(t) || []) {
      try { cb(evento.datos, evento); } catch (e) { console.error('[eventos]', t, e); }
    }
  }
}

function reintentar() {
  clearTimeout(timer);
  const espera = Math.min(30000, 1000 * 2 ** intento++);
  timer = setTimeout(abrir, espera);
}

function abrir() {
  const token = globalThis.AURORA_TOKEN();
  if (!token) return reintentar();
  const base = globalThis.AURORA_BASE.replace(/^http/, 'ws');
  ws = new WebSocket(`${base}/eventos?token=${encodeURIComponent(token)}`);
  ws.onopen = () => { intento = 0; };
  ws.onmessage = (e) => {
    try { despachar(JSON.parse(e.data)); } catch { /* frame no-JSON: ignorar */ }
  };
  ws.onclose = reintentar;
}

export function conectarEventos() {
  if (ws) return;
  abrir();
}
