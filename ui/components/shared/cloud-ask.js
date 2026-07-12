// Puente parent-side: Lyra ↔ iframe del LLM cloud. Postea AURORA_CLOUD_ASK
// al contentWindow del iframe y resuelve con la respuesta detectada por
// cloud-relay.js (que corre dentro del iframe vía all_frames).

let _seq = 0;

// Detiene la generación de la nube: le dice al relay que cancele la captura y
// clickee el botón "Detener respuesta" del sitio.
export function detenerCloud(iframe) {
  try { iframe?.contentWindow?.postMessage({ type: 'AURORA_CLOUD_STOP' }, '*'); } catch (_) {}
}

// askCloud(iframe, prompt, { onChunk, timeoutMs }) → Promise<{ok, text}>
export function askCloud(iframe, prompt, { onChunk, timeoutMs = 95000 } = {}) {
  const win = iframe?.contentWindow;
  if (!win) return Promise.resolve({ ok: false, text: 'Error: panel Cloud no está montado.' });

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
      if (d.type === 'AURORA_CLOUD_ANSWER') finish({ ok: !!d.ok, text: d.text || '', respondeMs: d.respondeMs, generaMs: d.generaMs, reason: d.reason });
    };
    window.addEventListener('message', onMsg);

    const tid = setTimeout(() => finish({ ok: false, text: 'Error: timeout esperando al AI (95s).' }), timeoutMs);

    // UN SOLO post. Antes se posteaba 2x (retry a 300ms) para cubrir el iframe
    // recién montado, pero el relay trataba el 2do ASK como request nueva y
    // CANCELABA la captura del 1ro → corte prematuro (vía composer cortaba en
    // ~25, directo funcionaba). El panel ya está montado al enviar, un post
    // basta. (El relay además dedup-ea por requestId como respaldo.)
    win.postMessage({ type: 'AURORA_CLOUD_ASK', prompt, requestId }, '*');
  });
}
