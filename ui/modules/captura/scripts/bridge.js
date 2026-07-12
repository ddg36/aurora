// Usa __aurora_bgRequest inyectado por boot.js — no reimporta ext-bridge.js.

function bgRequest(payload) {
  const fn = globalThis.__aurora_bgRequest;
  if (!fn) return Promise.reject(new Error('ext-bridge no inicializado'));
  return fn(payload);
}

export function extDisponible() {
  return globalThis.__aurora_enExtension?.value === true;
}

export async function getActiveTab() {
  const res = await bgRequest({ type: 'GET_ACTIVE_TAB' });
  if (!res?.success) throw new Error(res?.error || 'No se pudo obtener la pestaña activa');
  return res.tab;
}

export async function capturarTexto() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await bgRequest({ type: 'CAPTURE_ACTIVE_TAB' });
      if (!res?.success) throw new Error(res?.error || 'Error capturando texto');
      return { text: res.data, tab: res.tab };
    } catch (err) {
      if ((err.message?.includes?.('timeout') || err.message?.includes?.('Receiving end')) && attempt < 2) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 500 : 1500));
        continue;
      }
      throw new Error(err.message || 'Error capturando texto');
    }
  }
}

export async function capturarScreenshot() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await bgRequest({ type: 'VISUAL_OBSERVE_ACTIVE_TAB' });
      if (!res?.success) throw new Error(res?.error || 'Error capturando screenshot');
      return { dataUrl: res.screenshot, tab: res.tab };
    } catch (err) {
      if ((err.message?.includes?.('timeout') || err.message?.includes?.('Receiving end')) && attempt < 2) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 500 : 1500));
        continue;
      }
      throw new Error(err.message || 'Error capturando screenshot');
    }
  }
}

export async function capturarYoutube(tipo = 'withoutTimestamps') {
  const fn = globalThis.__aurora_bgRequest;
  if (!fn) return Promise.reject(new Error('ext-bridge no inicializado'));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fn({ type: 'CAPTURE_YOUTUBE', extractionType: tipo });
      if (!res?.success) throw new Error(res?.error || 'Error extrayendo YouTube');
      return res.content;
    } catch (err) {
      if (err.message.includes('Receiving end') && attempt < 2) {
        await fn({ type: 'REINJECT_YT_CS' });
        await new Promise(r => setTimeout(r, 600));
        continue;
      }
      throw new Error(err.message || 'Error extrayendo YouTube');
    }
  }
}

export async function inyectarTextoEnAI(tabId, text, send = false) {
  if (!extDisponible()) throw new Error('Extensión no disponible');
  const res = await bgRequest({ type: 'AURORA_INJECT_TEXT_TAB', tabId, text, send });
  if (!res?.ok) throw new Error(res?.error || 'Error inyectando texto');
  return res;
}

// ── Herramientas LLM (Lyra) ────────────────────────────────
function truncar(texto, max = 8000) {
  if (!texto) return '';
  return texto.length > max ? texto.slice(0, max) + '\n\n…(truncado)' : texto;
}

export async function resumirTranscript(transcript, titulo = '', onStream) {
  const { sendToLyra } = await import('../../../components/shared/lyra-ws.js');
  const tituloStr = titulo ? `Video: "${titulo}"\n` : '';
  const system = 'Sos un asistente útil. Resumí el contenido de forma clara y concisa.';
  const message = `Resumí este transcript de video en 3-5 párrafos cortos. Destacá los puntos principales.\n\n${tituloStr}${truncar(transcript, 8000)}`;
  let result = '';
  await sendToLyra({
    message,
    system,
    onToken: (token) => { result += token; onStream?.(result); },
  });
  return result.trim();
}

export async function puntosClave(transcript, titulo = '', onStream) {
  const { sendToLyra } = await import('../../../components/shared/lyra-ws.js');
  const tituloStr = titulo ? `Video: "${titulo}"\n` : '';
  const system = 'Sos un asistente útil. Extraé los puntos clave de forma organizada.';
  const message = `Extraé los puntos clave de este transcript. Formato: lista numerada con título corto y una frase de explicación por punto.\n\n${tituloStr}${truncar(transcript, 8000)}`;
  let result = '';
  await sendToLyra({
    message,
    system,
    onToken: (token) => { result += token; onStream?.(result); },
  });
  return result.trim();
}

export async function traducirTranscript(transcript, idioma, titulo = '', onStream) {
  const { sendToLyra } = await import('../../../components/shared/lyra-ws.js');
  const tituloStr = titulo ? `Video: "${titulo}"\n` : '';
  const system = `Traducí el contenido al ${idioma} de forma natural, manteniendo el tono y contexto.`;
  const message = `Traducí este transcript al ${idioma}. Mantené los timestamps si los hay.\n\n${tituloStr}${truncar(transcript, 8000)}`;
  let result = '';
  await sendToLyra({
    message,
    system,
    onToken: (token) => { result += token; onStream?.(result); },
  });
  return result.trim();
}

export async function notasEstudio(transcript, titulo = '', onStream) {
  const { sendToLyra } = await import('../../../components/shared/lyra-ws.js');
  const tituloStr = titulo ? `Video: "${titulo}"\n` : '';
  const system = 'Sos un asistente de estudio. Generá notas organizadas para aprender.';
  const message = `Generá notas de estudio para este transcript. Formato: tema principal, explicación con ejemplos, y una sección de "para recordar" al final.\n\n${tituloStr}${truncar(transcript, 8000)}`;
  let result = '';
  await sendToLyra({
    message,
    system,
    onToken: (token) => { result += token; onStream?.(result); },
  });
  return result.trim();
}
