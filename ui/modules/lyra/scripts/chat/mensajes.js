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

export function parsearMensajeRico(content) {
  if (!content) return [];
  const partes = [];
  const lineas = content.split('\n');
  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i];
    if (linea.startsWith('[thinking]')) {
      const contenido = [];
      i++;
      while (i < lineas.length && lineas[i] !== '[/thinking]') {
        contenido.push(lineas[i]);
        i++;
      }
      partes.push({ tipo: 'thinking', contenido: contenido.join('\n').trim() });
      i++;
    } else if (linea.startsWith('[tool_call:')) {
      const nombre = linea.slice('[tool_call:'.length, linea.lastIndexOf(']'));
      const contenido = [];
      i++;
      while (i < lineas.length && lineas[i] !== `[/tool_call:${nombre}]`) {
        contenido.push(lineas[i]);
        i++;
      }
      partes.push({ tipo: 'tool_call', nombre, id: null, args: contenido.join('\n').trim() });
      i++;
    } else if (linea.startsWith('[tool_result:')) {
      const rest = linea.slice('[tool_result:'.length, linea.lastIndexOf(']'));
      const isError = rest.endsWith(':error');
      const nombre = isError ? rest.slice(0, -':error'.length) : rest;
      const contenido = [];
      i++;
      while (i < lineas.length && lineas[i] !== `[/tool_result:${nombre}]`) {
        contenido.push(lineas[i]);
        i++;
      }
      partes.push({ tipo: 'tool_result', nombre, id: null, output: contenido.join('\n').trim(), isError });
      i++;
    } else if (linea.trim()) {
      const contenido = [];
      while (i < lineas.length && !lineas[i].startsWith('[')) {
        contenido.push(lineas[i]);
        i++;
      }
      const texto = contenido.join('\n').trim();
      if (texto) partes.push({ tipo: 'text', contenido: texto });
    } else {
      i++;
    }
  }
  return partes.filter(p => p.contenido || p.tipo !== 'text');
}

// Empareja tool_call+tool_result consecutivos (mismo nombre) en un solo bloque
// 'tool', preservando el orden cronológico real en que pi los generó.
export function combinarPartesRicas(partes) {
  const combinado = [];
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    if (p.tipo !== 'tool_call') {
      combinado.push(p);
      continue;
    }
    const siguiente = partes[i + 1];
    const conResultado = siguiente && siguiente.tipo === 'tool_result' && siguiente.nombre === p.nombre;
    combinado.push({
      tipo: 'tool',
      nombre: p.nombre,
      args: p.args,
      output: conResultado ? siguiente.output : null,
      isError: conResultado ? siguiente.isError : false,
    });
    if (conResultado) i++;
  }
  return combinado;
}

export function limpiarHistorial() {
  historial.value = [];
  limpiarStream();
}
