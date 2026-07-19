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
const _paneReloadWaiters = new Map();
const _pendingAnswers = new Map();
const answerKey = (requestId, paneId = 'cloud') => `${paneId}:${requestId}`;
globalThis.__auroraCloudTrace = globalThis.__auroraCloudTrace || [];

export function confirmarCloudAnswer(requestId, paneId = 'cloud') {
  if (!requestId) return false;
  _pendingAnswers.delete(answerKey(requestId, paneId));
  try {
    window.parent.postMessage({
      type: 'AURORA_CLOUD_ACK', requestId, __llmPane: paneId, ts: Date.now(),
    }, '*');
    return true;
  } catch (_) {
    return false;
  }
}

export function respuestasCloudPendientes() {
  return [..._pendingAnswers.values()].map(value => ({ ...value }));
}

function solicitarCloudOutbox() {
  try { window.parent.postMessage({ type: 'AURORA_CLOUD_OUTBOX_SYNC' }, '*'); } catch (_) {}
}

// Cubrir tanto una importación temprana como el bridge que termina de montar
// unos frames después. La respuesta permanece en el outbox hasta el ACK.
for (const delay of [0, 700, 2200]) setTimeout(solicitarCloudOutbox, delay);
const emitirEstado = entry => window.dispatchEvent(new CustomEvent('aurora:cloud-status', { detail: entry }));
window.addEventListener('message', (e) => {
  if (e.data?.type === 'AURORA_CLOUD_ANSWER' && e.data.requestId) {
    const paneId = e.data.__llmPane || 'cloud';
    const answer = { ...e.data, __llmPane: paneId };
    _pendingAnswers.set(answerKey(e.data.requestId, paneId), answer);
    window.dispatchEvent(new CustomEvent('aurora:cloud-answer-pending', { detail: answer }));
    return;
  }
  if (e.data?.type === 'AURORA_CLOUD_RESETTING') {
    const paneId = e.data.__llmPane || 'cloud';
    if (e.source === window.parent) _extPanesReady.delete(paneId);
    else if (e.source) _readyWindows.delete(e.source);
    emitirEstado({ ts: Date.now(), fase: 'resetting', reason: e.data.reason, paneId });
    if (e.data.reason === 'pane_reload') {
      for (const wake of [...(_paneReloadWaiters.get(paneId) || [])]) wake();
    }
    return;
  }
  if (e.data?.type === 'AURORA_CLOUD_STATUS' && e.data.entry) {
    const entry = { ...e.data.entry, paneId: e.data.__llmPane || e.data.entry.paneId || 'cloud' };
    globalThis.__auroraCloudTrace.push(entry);
    if (globalThis.__auroraCloudTrace.length > 300) globalThis.__auroraCloudTrace.splice(0, globalThis.__auroraCloudTrace.length - 300);
    emitirEstado(entry);
    return;
  }
  if (e.data?.type === 'AURORA_CLOUD_NAV_CHANGED') {
    const paneId = e.data.__llmPane || 'cloud';
    window.dispatchEvent(new CustomEvent('aurora:cloud-nav-changed', { detail: { ...e.data, paneId } }));
    return;
  }
  if (e.data?.type === 'AURORA_CLOUD_SYNC_HILO') {
    const paneId = e.data.__llmPane || 'cloud';
    window.dispatchEvent(new CustomEvent('aurora:cloud-sync-hilo', { detail: { ...e.data, paneId } }));
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

// Lectura fresca de la URL real del iframe, bajo demanda — no confiar en
// cloudUrl de React, que puede seguir apuntando al hilo viejo justo tras un
// cambio de conversación (verificado en vivo: escribir casi al instante tras
// cambiar de hilo persistía el mensaje bajo el conv_id incorrecto). Fallback
// al valor pasado si no hay respuesta en 500ms (relay caído/timeout) — mejor
// seguir con un valor potencialmente viejo que bloquear el envío.
export function urlRealDelIframe(iframe, fallback, paneId = 'cloud', timeoutMs = 500) {
  return new Promise(resolve => {
    const requestId = `where-${Date.now()}-${++_seq}`;
    let done = false;
    const finish = url => { if (done) return; done = true; window.removeEventListener('message', onMsg); resolve(url); };
    const onMsg = e => {
      if (e.data?.type === 'AURORA_CLOUD_WHERE_AM_I_ANSWER' && e.data.requestId === requestId) finish(e.data.url || fallback);
    };
    window.addEventListener('message', onMsg);
    setTimeout(() => finish(fallback), timeoutMs);
    try { postAlRelay(iframe, { type: 'AURORA_CLOUD_WHERE_AM_I', requestId, __llmPane: paneId }); } catch (_) { finish(fallback); }
  });
}

// Abre y CONFIRMA una conversación limpia en el proveedor. El relay guarda un
// marcador en sessionStorage para sobrevivir a la navegación y sólo responde
// cuando el nuevo composer existe y el DOM del hilo anterior desapareció.
export async function nuevaConversacionCloud(iframe, paneId = 'cloud', timeoutMs = 35000) {
  if (!await esperarRelay(iframe, paneId)) {
    return { ok: false, reason: 'relay_not_ready', paneId,
      error: `El relay Cloud (${paneId}) no quedó listo para iniciar una conversación.` };
  }
  const requestId = `cloud-new-${Date.now()}-${++_seq}`;
  return new Promise(resolve => {
    let done = false;
    const finish = result => {
      if (done) return;
      done = true;
      clearTimeout(tid);
      window.removeEventListener('message', onMsg);
      resolve({ paneId, ...result });
    };
    const onMsg = e => {
      const d = e.data;
      if (d?.type !== 'AURORA_CLOUD_NEW_CHAT_ANSWER' || d.requestId !== requestId) return;
      finish({ ok: !!d.ok, reason: d.reason, error: d.error, url: d.url });
    };
    window.addEventListener('message', onMsg);
    const tid = setTimeout(() => finish({ ok: false, reason: 'new_chat_timeout',
      error: `El panel ${paneId} no confirmó un chat nuevo en ${Math.round(timeoutMs / 1000)}s.` }), timeoutMs);
    postAlRelay(iframe, { type: 'AURORA_CLOUD_NEW_CHAT', requestId, __llmPane: paneId });
  });
}

// askCloud(iframe, prompt, { onChunk, timeoutMs, images, files }) → Promise<{ok, text}>
// iframe null/sin contentWindow → modo extPane (ruteo por el bridge).
// images: array de data URLs / base64 (se pegan al composer del LLM).
// files: array de {name, content, type} (adjuntos de texto).
export async function askCloud(iframe, prompt, {
  onChunk, timeoutMs = 600000, images, files, paneId = 'cloud',
  requestId: providedRequestId, manualAck = false, resumeOnly = false,
} = {}) {

  const requestId = providedRequestId || `cloud-${Date.now()}-${++_seq}`;
  const cached = _pendingAnswers.get(answerKey(requestId, paneId));
  if (cached) {
    const result = {
      ok: !!cached.ok && cached.reason !== 'timeout', text: cached.text || '',
      images: cached.images, respondeMs: cached.respondeMs, generaMs: cached.generaMs,
      reason: cached.reason, paneId, requestId, replayed: true,
    };
    if (!manualAck) confirmarCloudAnswer(requestId, paneId);
    return result;
  }

  if (!await esperarRelay(iframe, paneId)) {
    return { ok: false, text: `Error: el relay Cloud (${paneId}) no quedó listo en 20s. Recargá el panel o verificá que la extensión AI Hub esté activa.`, reason: 'relay_not_ready', paneId, requestId };
  }

  return new Promise((resolve) => {
    let done = false;
    let onPaneReload = null;
    let needsResume = false;
    let resumeTid = null;
    const request = {
      type: 'AURORA_CLOUD_ASK', prompt, requestId, images, files,
      captureTimeoutMs: Math.max(1000, timeoutMs - 1500), __llmPane: paneId,
    };
    const finish = (r) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      if (onPaneReload) {
        const waiters = _paneReloadWaiters.get(paneId);
        waiters?.delete(onPaneReload);
        if (!waiters?.size) _paneReloadWaiters.delete(paneId);
      }
      clearTimeout(tid);
      if (resumeTid) clearTimeout(resumeTid);
      resolve(r);
    };

    const onMsg = (e) => {
      const d = e.data;
      const messagePane = d?.__llmPane || paneId;
      if (d?.type === 'AURORA_CLOUD_RESETTING' && messagePane === paneId && d.reason === 'provider_navigation') {
        needsResume = true;
        return;
      }
      if (d?.type === 'AURORA_CLOUD_READY' && messagePane === paneId && needsResume) {
        needsResume = false;
        postAlRelay(iframe, request);
        return;
      }
      if (!d || d.requestId !== requestId) return;
      if (d.type === 'AURORA_CLOUD_CHUNK') { onChunk?.(d.text || ''); return; }
      if (d.type === 'AURORA_CLOUD_ANSWER') {
        if (d.reason === 'timeout') detenerCloud(iframe, paneId);
        const result = {
          ok: !!d.ok && d.reason !== 'timeout', text: d.text || '', images: d.images,
          respondeMs: d.respondeMs, generaMs: d.generaMs, reason: d.reason,
          paneId: d.__llmPane || paneId, requestId, replayed: !!d.__auroraOutboxReplay,
        };
        if (!manualAck) confirmarCloudAnswer(requestId, result.paneId);
        finish(result);
      }
    };
    window.addEventListener('message', onMsg);
    onPaneReload = () => finish({ ok: false,
      text: 'El panel Cloud fue recargado durante la solicitud.',
      reason: 'pane_reloaded', paneId });
    if (!_paneReloadWaiters.has(paneId)) _paneReloadWaiters.set(paneId, new Set());
    _paneReloadWaiters.get(paneId).add(onPaneReload);

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
    if (resumeOnly) {
      // Primero dar tiempo al bridge para reproducir una respuesta ya capturada.
      // Si no existe todavía, reenviar el MISMO requestId cubre también el caso
      // en que Aurora cayó justo antes de que el ASK llegara al relay. El relay
      // deduplica el requestId cuando la generación original sigue en curso.
      solicitarCloudOutbox();
      resumeTid = setTimeout(() => {
        if (!done) postAlRelay(iframe, request);
      }, 1400);
    } else {
      postAlRelay(iframe, request);
    }
  });
}
