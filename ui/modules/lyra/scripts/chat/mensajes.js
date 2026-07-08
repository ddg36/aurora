import { signal } from '../../../../store.js';
import { BASE, hdrs } from '../../../../components/shared/api.js';

export const historial        = signal([]);
export const streamingActual  = signal('');
export const thinkingActual   = signal('');
export const toolEvents       = signal([]);
export const cargando         = signal(false);

export function registrarToolEvent(evento) {
  toolEvents.value = [...toolEvents.value, { ...evento, ts: Date.now() }];
}

export function limpiarStream() {
  streamingActual.value = '';
  thinkingActual.value  = '';
  toolEvents.value      = [];
}

function normalizeMensaje(m) {
  const role = m.role ?? m.rol ?? 'assistant';
  const content = m.content ?? m.contenido ?? m.texto ?? '';
  const tsRaw = m.ts ?? m.creado_en ?? Date.now();
  const ts = tsRaw < 1000000000000 ? tsRaw * 1000 : tsRaw;
  return { ...m, role, content, ts };
}

function appendIfNotLast(msg) {
  const last = historial.value[historial.value.length - 1];
  if (last && last.role === msg.role && last.content === msg.content) return;
  historial.value = [...historial.value, msg];
}

export async function cargarMensajes(chatId) {
  if (!chatId) {
    historial.value = [];
    return;
  }

  try {
    const res = await fetch(`${BASE}/db/chats/${chatId}/mensajes`, { headers: hdrs() });
    if (res.ok) {
      const rows = await res.json();
      historial.value = Array.isArray(rows) ? rows.map(normalizeMensaje) : [];
    }
  } catch {}
}

export async function guardarMensaje(chatId, rol, texto) {
  if (!chatId || !texto) return null;

  const localMsg = { role: rol, content: texto, ts: Date.now() };

  try {
    const res = await fetch(`${BASE}/db/chats/mensajes`, {
      method: 'POST',
      headers: hdrs(),
      body: JSON.stringify({
        chat_id: Number(chatId),
        rol,
        contenido: texto,
      }),
    });

    if (res.ok) {
      appendIfNotLast(localMsg);
      return localMsg;
    }
  } catch {}

  return null;
}

export async function borrarMensaje(mensajeId) {
  if (!mensajeId) return false;
  try {
    const res = await fetch(`${BASE}/db/chats/mensajes/${mensajeId}`, {
      method: 'DELETE',
      headers: hdrs(),
    });
    if (!res.ok) return false;
    historial.value = historial.value.filter(m => m.id !== mensajeId);
    return true;
  } catch {
    return false;
  }
}

export function agregarMensajeLocal(rol, texto) {
  appendIfNotLast({ role: rol, content: texto, ts: Date.now() });
}

export function agregarMensajeRico(msg) {
  appendIfNotLast({ ts: Date.now(), ...msg });
}

export function limpiarHistorial() {
  historial.value = [];
  limpiarStream();
}
