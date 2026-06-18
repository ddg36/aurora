import { signal } from '../../../../store.js';

const BASE = globalThis.__AURORA_BASE__ || 'http://localhost:7779';
const hdrs = () => globalThis.__AURORA_HDRS__?.() || { 'Content-Type': 'application/json' };

export const chats        = signal([]);
export const chatActualId = signal(null);

function normalizeTimestamp(value) {
  const n = Number(value || Date.now());
  return n < 1000000000000 ? n * 1000 : n;
}

function normalizeChat(c, fallbackName = 'Chat sin nombre') {
  const id = c.id ?? c.chat_id;
  if (id == null) return null;
  const updatedAt = normalizeTimestamp(c.updatedAt ?? c.actualizado ?? c.creado_en ?? id);
  return {
    ...c,
    id,
    nombre: c.nombre || fallbackName,
    modelo: c.modelo ?? c.modelo_id ?? '',
    updatedAt,
  };
}

export function fmtFecha(ts) {
  if (!ts) return '';
  const d = new Date(ts), hoy = new Date();
  if (d.toDateString() === hoy.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function autoNombre(mensajes) {
  const primero = mensajes.find(m => m.role === 'user');
  if (!primero) return 'Chat sin nombre';
  return primero.content.substring(0, 38) + (primero.content.length > 38 ? '…' : '');
}

export async function cargarChats() {
  try {
    const res = await fetch(`${BASE}/db/chats`, { headers: hdrs() });
    if (res.ok) {
      const rows = await res.json();
      chats.value = (Array.isArray(rows) ? rows : [])
        .map(c => normalizeChat(c))
        .filter(Boolean);
    }
  } catch {}
}

export async function crearChat(nombre) {
  const safeName = nombre || 'Chat sin nombre';
  try {
    const res = await fetch(`${BASE}/db/chats`, {
      method: 'POST',
      headers: hdrs(),
      body: JSON.stringify({ nombre: safeName }),
    });
    if (res.ok) {
      const raw = await res.json();
      const chat = normalizeChat(raw, safeName);
      if (!chat) return null;
      chats.value = [chat, ...chats.value.filter(c => c.id !== chat.id)];
      chatActualId.value = chat.id;
      return chat;
    }
  } catch {}
  return null;
}

export async function renombrarChat(id, nombre) {
  if (!id) return;
  try {
    await fetch(`${BASE}/db/chats/${id}`, {
      method: 'PATCH',
      headers: hdrs(),
      body: JSON.stringify({ nombre }),
    });
    chats.value = chats.value.map(c => c.id === id ? { ...c, nombre, updatedAt: Date.now() } : c);
  } catch {}
}

export async function eliminarChat(id) {
  if (!id) return;
  try {
    await fetch(`${BASE}/db/chats/${id}`, { method: 'DELETE', headers: hdrs() });
    chats.value = chats.value.filter(c => c.id !== id);
    if (chatActualId.value === id) {
      chatActualId.value = chats.value[0]?.id ?? null;
    }
  } catch {}
}

export async function autoGuardar(historial, modeloSeleccionado) {
  const id = chatActualId.value;
  if (!id || historial.length === 0) return;
  const nombre = autoNombre(historial);
  try {
    await fetch(`${BASE}/db/chats/${id}`, {
      method: 'PUT',
      headers: hdrs(),
      body: JSON.stringify({
        nombre,
        modelo: modeloSeleccionado,
        modelo_id: modeloSeleccionado,
        updatedAt: Date.now(),
      }),
    });
    chats.value = chats.value.map(c => c.id === id ? { ...c, nombre, modelo: modeloSeleccionado, updatedAt: Date.now() } : c);
  } catch {}
}

export function exportarChat(historial, modeloSeleccionado, formato) {
  if (historial.length === 0) return;
  const nombre   = autoNombre(historial);
  const visibles = historial.filter(m => m.role !== 'system');
  let contenido, mime, ext;
  if (formato === 'md') {
    const cabecera = `# ${nombre}\n\n**Modelo:** ${modeloSeleccionado}  \n**Fecha:** ${new Date().toLocaleString()}\n\n---\n\n`;
    const cuerpo   = visibles.map(m => `**${m.role === 'user' ? 'Tú' : 'Local AI'}:**\n\n${m.content}`).join('\n\n---\n\n');
    contenido = cabecera + cuerpo; mime = 'text/markdown'; ext = 'md';
  } else {
    contenido = JSON.stringify({ nombre, modelo: modeloSeleccionado, mensajes: visibles, exportedAt: Date.now() }, null, 2);
    mime = 'application/json'; ext = 'json';
  }
  const blob = new Blob([contenido], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${nombre.replace(/[^a-z0-9]/gi, '_')}.${ext}`; a.click();
  URL.revokeObjectURL(url);
}
