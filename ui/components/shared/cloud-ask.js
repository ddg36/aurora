// Puente parent-side: Lyra ↔ iframe del LLM cloud. Postea AURORA_CLOUD_ASK
// al contentWindow del iframe y resuelve con la respuesta detectada por
// cloud-relay.js (que corre dentro del iframe vía all_frames).

let _seq = 0;

// El ASK no puede enviarse hasta que el content script anuncie READY. Sin este
// gate, el primer mensaje se perdía si el usuario enviaba mientras el LLM aún
// estaba cargando. El módulo se importa antes de montar el panel, así que
// conserva también los READY que llegaron antes de askCloud().
const _readyWindows = new WeakSet();
const _extPanesReady = new Set();
const _readyWaiters = new Set();
globalThis.__auroraCloudTrace = globalThis.__auroraCloudTrace || [];
const emitirEstado = entry => window.dispatchEvent(new CustomEvent('aurora:cloud-status', { detail: entry }));
window.addEventListener('message', (e) => {
  if (e.data?.type === 'AURORA_CLOUD_RESETTING') {
    const paneId = e.data.__llmPane || 'cloud';
    if (e.source === window.parent) _extPanesReady.delete(paneId);
    else if (e.source) _readyWindows.delete(e.source);
    emitirEstado({ ts: Date.now(), fase: 'resetting', reason: e.data.reason, paneId });
    return;
  }
  if (e.data?.type === 'AURORA_CLOUD_STATUS' && e.data.entry) {
    const entry = { ...e.data.entry, paneId: e.data.__llmPane || e.data.entry.paneId || 'cloud' };
    globalThis.__auroraCloudTrace.push(entry);
    if (globalThis.__auroraCloudTrace.length > 300) globalThis.__auroraCloudTrace.splice(0, globalThis.__auroraCloudTrace.length - 300);
    emitirEstado(entry);
    return;
  }
  if (e.data?.type !== 'AURORA_CLOUD_READY') return;
  const paneId = e.data.__llmPane || 'cloud';
  if (e.source === window.parent) _extPanesReady.add(paneId);
  else if (e.source) _readyWindows.add(e.source);
  emitirEstado({ ts: Date.now(), fase: 'ready', host: e.data.host, paneId });
  for (const wake of [..._readyWaiters]) wake();
});

function relayListo(iframe, paneId = 'cloud') {
  const win = iframe?.contentWindow;
  return win ? _readyWindows.has(win) : _extPanesReady.has(paneId);
}

export function invalidarCloudRelay(iframe, paneId = 'cloud') {
  const win = iframe?.contentWindow;
  if (win) _readyWindows.delete(win);
  else _extPanesReady.delete(paneId);
}

function esperarRelay(iframe, paneId = 'cloud', timeoutMs = 20000) {
  if (relayListo(iframe, paneId)) return Promise.resolve(true);
  return new Promise(resolve => {
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(tid);
      clearInterval(ping);
      _readyWaiters.delete(check);
      resolve(ok);
    };
    const check = () => { if (relayListo(iframe, paneId)) finish(true); };
    const tid = setTimeout(() => finish(false), timeoutMs);
    const enviarPing = () => postAlRelay(iframe, { type: 'AURORA_CLOUD_PING', __llmPane: paneId });
    const ping = setInterval(enviarPing, 1000);
    _readyWaiters.add(check);
    enviarPing();
  });
}

// Enviar al relay del LLM. Inline: directo a iframe.contentWindow. extPane
// (iframe montado a nivel de extensión, sin handle acá): postear a window.parent
// (newtab) — aurora-bridge.js lo reenvía al iframe LLM y devuelve las respuestas.
function postAlRelay(iframe, msg) {
  const win = iframe?.contentWindow;
  if (win) win.postMessage(msg, '*');
  else window.parent.postMessage({ ...msg, __llmPane: msg.__llmPane || 'cloud' }, '*');
}

// Detiene la generación de la nube: le dice al relay que cancele la captura y
// clickee el botón "Detener respuesta" del sitio.
export function detenerCloud(iframe, paneId = 'cloud') {
  try { postAlRelay(iframe, { type: 'AURORA_CLOUD_STOP', __llmPane: paneId }); } catch (_) {}
}

// askCloud(iframe, prompt, { onChunk, timeoutMs, images, files }) → Promise<{ok, text}>
// iframe null/sin contentWindow → modo extPane (ruteo por el bridge).
// images: array de data URLs / base64 (se pegan al composer del LLM).
// files: array de {name, content, type} (adjuntos de texto).
export async function askCloud(iframe, prompt, { onChunk, timeoutMs = 240000, images, files, paneId = 'cloud' } = {}) {

  if (!await esperarRelay(iframe, paneId)) {
    return { ok: false, text: `Error: el relay Cloud (${paneId}) no quedó listo en 20s. Recargá el panel o verificá que la extensión AI Hub esté activa.`, reason: 'relay_not_ready', paneId };
  }

  const requestId = `cloud-${Date.now()}-${++_seq}`;

  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      clearTimeout(tid);
      resolve(r);
    };

    const onMsg = (e) => {
      const d = e.data;
      if (!d || d.requestId !== requestId) return;
      if (d.type === 'AURORA_CLOUD_CHUNK') { onChunk?.(d.text || ''); return; }
      if (d.type === 'AURORA_CLOUD_ANSWER') {
        if (d.reason === 'timeout') detenerCloud(iframe, paneId);
        finish({ ok: !!d.ok && d.reason !== 'timeout', text: d.text || '', respondeMs: d.respondeMs, generaMs: d.generaMs, reason: d.reason, paneId: d.__llmPane || paneId });
      }
    };
    window.addEventListener('message', onMsg);

    const tid = setTimeout(() => {
      detenerCloud(iframe, paneId);
      emitirEstado({ ts: Date.now(), fase: 'stop', reason: 'parent_timeout', paneId });
      finish({
        ok: false,
        text: `Error: timeout esperando al AI (${Math.round(timeoutMs / 1000)}s).`,
        reason: 'parent_timeout', paneId,
      });
    }, timeoutMs);

    // UN SOLO post. Antes se posteaba 2x (retry a 300ms) para cubrir el iframe
    // recién montado, pero el relay trataba el 2do ASK como request nueva y
    // CANCELABA la captura del 1ro → corte prematuro (vía composer cortaba en
    // ~25, directo funcionaba). El panel ya está montado al enviar, un post
    // basta. (El relay además dedup-ea por requestId como respaldo.)
    // El relay debe cerrar ANTES que esta Promise. Si ambos usan 95s exactos,
    // el padre puede declarar timeout y perder el error específico que llega
    // milisegundos después (p. ej. ChatGPT atascado en Thinking).
    postAlRelay(iframe, {
      type: 'AURORA_CLOUD_ASK', prompt, requestId, images, files,
      captureTimeoutMs: Math.max(1000, timeoutMs - 1500),
      __llmPane: paneId,
    });
  });
}
