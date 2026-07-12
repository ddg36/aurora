// Puente Aurora ↔ extensión Chrome.
// No importa store.js — usa globalThis.__aurora_setExtContext inyectado por boot.js.

let _reqId = 0;
const _pending = new Map();

export function bgRequest(payload) {
  return new Promise((resolve, reject) => {
    const id = ++_reqId;
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error('ext-bridge timeout'));
    }, 20000);
    _pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ type: 'AURORA_BG_REQUEST', id, payload }, '*');
  });
}

function handleMessage(e) {
  if (e.data?.type === 'AURORA_EXT_HELLO') {
    const setter = globalThis.__aurora_setExtContext;
    if (setter) {
      setter({
        id:         e.data.extensionId || 'unknown',
        extensions: e.data.extensions  || [],
        caps:       e.data.caps        || [],
        // 'sidepanel' | 'newtab' | undefined (browser suelto, sin extensión).
        // Features que sólo tienen sentido en un side panel real (ej. capturar
        // LA MISMA pestaña que aloja a Aurora no tiene sentido en newtab,
        // donde Aurora ES la pestaña activa) pueden avisar en vez de fallar
        // silencioso comparando esto, sin necesidad de otro campo nuevo.
        surface:    e.data.surface     || null,
      });
    }
    try { window.parent.postMessage({ type: 'AURORA_EXT_ACK' }, '*'); } catch (_) {}
    return;
  }

  if (e.data?.type === 'AURORA_BG_RESPONSE') {
    const entry = _pending.get(e.data.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    _pending.delete(e.data.id);
    entry.resolve(e.data.result);
  }
}

export function initExtBridge() {
  window.addEventListener('message', handleMessage);
  // Drenar HELLOs que llegaron antes de que boot terminara
  const queue = globalThis.__aurora_ext_hello_queue || [];
  for (const e of queue) handleMessage(e);
  globalThis.__aurora_ext_hello_queue = [];
}
