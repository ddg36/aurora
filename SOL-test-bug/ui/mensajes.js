import { signal } from '../../../../store.js';
import { BASE, hdrs } from '../../../../components/shared/api.js';

export const historial        = signal([]);
export const streamingActual  = signal('');
export const thinkingActual   = signal('');
export const toolEvents       = signal([]);
export const cargando         = signal(false);
// true mientras un LLM de la nube genera (directo o Duo): oculta "Pensando…"
// y muestra "☁ generando…" mientras la burbuja crece con el stream.
export const cloudGenerando   = signal(false);

let _uiSeq = 0;

export function crearUiIdMensaje(prefijo = 'msg') {
  try {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) return `${prefijo}:${uuid}`;
  } catch (_) {}
  _uiSeq += 1;
  return `${prefijo}:${Date.now().toString(36)}:${_uiSeq.toString(36)}`;
}

export function asegurarUiIdMensaje(msg, prefijo = 'msg') {
  if (typeof msg?._uiId === 'string' && msg._uiId) return msg._uiId;
  const dbId = msg?.id ?? msg?.mensaje_id;
  if (dbId !== undefined && dbId !== null && dbId !== '') return `db:${dbId}`;
  return crearUiIdMensaje(prefijo);
}

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
  const normalizado = { ...m, role, content, ts };
  return { ...normalizado, _uiId: asegurarUiIdMensaje(normalizado) };
}

function appendIfNotLast(msg) {
  const normalizado = normalizeMensaje(msg);
  const arr = historial.value;
  const last = arr[arr.length - 1];
  if (last && last.role === normalizado.role && last.content === normalizado.content) {
    const combinado = { ...last, ...normalizado, _uiId: last._uiId || normalizado._uiId };
    historial.value = [...arr.slice(0, -1), combinado];
    return combinado;
  }
  historial.value = [...arr, normalizado];
  return normalizado;
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

  const localMsg = normalizeMensaje({ role: rol, content: texto, ts: Date.now() });

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
      let persistido = null;
      try { persistido = await res.json(); } catch (_) {}
      const conDb = persistido && typeof persistido === 'object'
        ? normalizeMensaje({ ...localMsg, ...persistido, _uiId: localMsg._uiId })
        : localMsg;
      return appendIfNotLast(conDb);
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
  return appendIfNotLast({ role: rol, content: texto, ts: Date.now() });
}

export function agregarMensajeRico(msg) {
  return appendIfNotLast({ ts: Date.now(), ...msg });
}

// Cache por contenido: parsearMensajeRico corre por CADA mensaje en CADA render.
// Con streaming (muchos renders) y varios mensajes grandes acumulados, re-parsear
// todo cada vez pinea el main thread. El contenido de un mensaje ya emitido es
// estable → parsear una vez. Solo el mensaje en streaming (contenido cambiante)
// hace miss.
const _cacheRico = new Map();
const _CACHE_RICO_MAX = 300;

export function parsearMensajeRico(content) {
  if (!content) return [];
  const hit = _cacheRico.get(content);
  if (hit !== undefined) return hit;
  const res = _parsearMensajeRico(content);
  if (_cacheRico.size >= _CACHE_RICO_MAX) _cacheRico.delete(_cacheRico.keys().next().value);
  _cacheRico.set(content, res);
  return res;
}

function _parsearMensajeRico(content) {
  const partes = [];
  const lineas = content.split('\n');
  // Sólo estos prefijos abren bloques del protocolo rico. Antes el parser
  // detenía texto ante CUALQUIER línea que empezara con `[`. Un resultado de
  // tool como `[ERROR] no such file` no coincidía con ningún branch y tampoco
  // incrementaba `i`: loop infinito que congelaba por completo Aurora.
  const esInicioEstructurado = linea =>
    linea === '[thinking]' || linea.startsWith('[tool_call:') || linea.startsWith('[tool_result:');
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
      const cierre = linea.lastIndexOf(']');
      const interior = linea.slice('[tool_call:'.length, cierre);
      const nombre_tid = interior.split(':');
      const nombre = nombre_tid[0];
      const tid = nombre_tid[1] || '';
      const contenido = [];
      i++;
      while (i < lineas.length && lineas[i] !== `[/tool_call:${nombre}${tid ? ':' + tid : ''}]` && lineas[i] !== `[/tool_call:${nombre}]`) {
        contenido.push(lineas[i]);
        i++;
      }
      partes.push({ tipo: 'tool_call', nombre, id: tid || null, args: contenido.join('\n').trim() });
      i++;
    } else if (linea.startsWith('[tool_result:')) {
      const cierre = linea.lastIndexOf(']');
      const interior = linea.slice('[tool_result:'.length, cierre);
      const partes_int = interior.split(':');
      const es_error = partes_int.includes('error');
      const nombre = partes_int[0];
      const tid = partes_int[1] || '';
      const contenido = [];
      i++;
      while (i < lineas.length && lineas[i] !== `[/tool_result:${nombre}${tid ? ':' + tid : ''}]` && lineas[i] !== `[/tool_result:${nombre}]`) {
        contenido.push(lineas[i]);
        i++;
      }
      partes.push({ tipo: 'tool_result', nombre, id: tid || null, output: contenido.join('\n').trim(), isError: es_error });
      i++;
    } else if (linea.trim()) {
      const contenido = [];
      while (i < lineas.length && !esInicioEstructurado(lineas[i])) {
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
