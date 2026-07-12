// Envío al Cloud Backend (LLM externo en iframe) desde el chat de Lyra.
// La respuesta aparece en el mismo hilo pero marcada _via:'direct-ai' (visual
// distinto) y NUNCA toca a pi: no llama sendToLyra ni guarda en la tabla
// `mensajes` (contexto de pi). Su memoria vive aparte en cloud_mensajes.

import { historial, cargando, cloudGenerando } from './mensajes.js';
import { askCloud } from '../../../../components/shared/cloud-ask.js';
import { postJSON } from '../../../../components/shared/api.js';

// Reemplaza el último mensaje del historial (el placeholder en vivo del cloud).
function actualizarUltimo(patch) {
  const arr = historial.value;
  if (!arr.length) return;
  historial.value = [...arr.slice(0, -1), { ...arr[arr.length - 1], ...patch }];
}

// Conversación cloud por host+url — memoria propia, separada de pi.
async function asegurarConversacion(aiId, url) {
  try {
    const r = await postJSON('/db/llm/cloud/conversaciones', { llm: aiId, url, titulo: aiId });
    return r?.id ?? null;
  } catch { return null; }
}

async function persistir(convId, rol, contenido) {
  if (!convId) return;
  try { await postJSON('/db/llm/cloud/mensajes', { conv_id: convId, rol, contenido }); } catch (_) {}
}

// enviarACloud: pinta user + respuesta del AI en el hilo de Lyra, con memoria
// propia. Devuelve cuando el AI terminó (o falló/timeout).
export async function enviarACloud({ iframe, texto, aiId, url }) {
  historial.value = [...historial.value, { role: 'user', content: texto, ts: Date.now() }];
  historial.value = [...historial.value, { role: 'assistant', content: '', _via: 'direct-ai', ts: Date.now() }];

  cargando.value = true;
  cloudGenerando.value = true;
  const convId = await asegurarConversacion(aiId, url);
  await persistir(convId, 'user', texto);

  const t0 = Date.now();
  try {
    const res = await askCloud(iframe, texto, {
      onChunk: (parcial) => actualizarUltimo({ content: parcial }),
    });
    const final = res.text || '(sin respuesta detectada)';
    // Dos medidores: responde = cuánto tardó en empezar a escribir; genera =
    // cuánto tardó la respuesta completa (medido por nuestra captura). rt =
    // round-trip total del lado de Lyra (debe coincidir con genera + overhead).
    actualizarUltimo({ content: final, _timing: { responde: res.respondeMs, genera: res.generaMs, rt: Date.now() - t0 } });
    await persistir(convId, 'assistant', final);
  } catch (err) {
    actualizarUltimo({ content: 'Error: ' + (err?.message || err) });
  } finally {
    cargando.value = false;
    cloudGenerando.value = false;
  }
}
