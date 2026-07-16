// Envío al Cloud Backend (LLM externo en iframe) desde el chat de Lyra.
// La respuesta aparece en el mismo hilo pero marcada _via:'direct-ai' (visual
// distinto) y NUNCA toca a pi: no llama sendToLyra ni guarda en la tabla
// `mensajes` (contexto de pi). Su memoria vive aparte en cloud_mensajes.
//
// Tools: el LLM de la nube puede pedir las herramientas REALES de pi
// (read/bash/edit/write) escribiendo bloques ```json ejecutables. Un pi
// DEDICADO las ejecuta (POST /pi/cloud-tool, sesión propia — "engaño": pi
// cree que es tarea suya) y el resultado vuelve al iframe. Loop agéntico.

import { historial, cargando, cloudGenerando, agregarMensajeRico } from './mensajes.js';
import { askCloud, confirmarCloudAnswer } from '../../../../components/shared/cloud-ask.js';
import { postJSON } from '../../../../components/shared/api.js';
import { detectarToolDraft, toolVisual, emitirToolVisual } from '../../../../components/shared/cloud-tool-visual.js';
import { submitForge } from '../../../../components/shared/forge-submit.js';

// Tools reales del harness de pi (verificado). Solo estas se aceptan.
const TOOLS_PI = {
  read:  'Leé un archivo. args: {"path": "ruta"}',
  bash:  'Corré un comando de shell. args: {"cmd": "comando"}',
  edit:  'Editá un archivo por reemplazo exacto. args: {"path","oldText","newText"}',
  write: 'Escribí/creá un archivo. args: {"path","content"}',
  forge_submit: 'Entrega una herramienta versionada. args: {"manifest":{...},"code":"handler.py"}',
  view_describe: 'Descubre una interfaz de Aurora. args: {"view":"scratchpad|md-reader|canvas"}',
  view_invoke: 'Invoca una acción nativa de Aurora. args: {"view","action","args":{...}}',
};

const TOOL_ARG_RULES = {
  read:          { required: ['path'], allowed: ['path'], strings: ['path'] },
  bash:          { required: ['cmd'], allowed: ['cmd'], strings: ['cmd'] },
  edit:          { required: ['path', 'oldText', 'newText'], allowed: ['path', 'oldText', 'newText'], strings: ['path', 'oldText', 'newText'] },
  write:         { required: ['path', 'content'], allowed: ['path', 'content'], strings: ['path', 'content'] },
  forge_submit:  { required: ['manifest', 'code'], allowed: ['manifest', 'code'], strings: ['code'], objects: ['manifest'] },
  view_describe: { required: ['view'], allowed: ['view'], strings: ['view'] },
  view_invoke:   { required: ['view', 'action', 'args'], allowed: ['view', 'action', 'args'], strings: ['view', 'action'], objects: ['args'] },
};

function esObjetoPlano(valor) {
  return !!valor && typeof valor === 'object' && !Array.isArray(valor);
}

function validarToolCall(obj) {
  if (!esObjetoPlano(obj)) return { error: 'Cada bloque final debe contener un único objeto JSON.' };

  const claves = Object.keys(obj);
  const extrasTop = claves.filter(k => k !== 'tool' && k !== 'args');
  if (extrasTop.length) return { error: `Claves superiores no permitidas: ${extrasTop.join(', ')}. Usá solamente "tool" y "args".` };
  if (typeof obj.tool !== 'string' || !obj.tool.trim()) return { error: 'La clave "tool" debe ser un string no vacío.' };
  if (!(obj.tool in TOOLS_PI)) return { error: `Tool desconocida "${obj.tool}". Válidas: ${Object.keys(TOOLS_PI).join(', ')}.` };
  if (!esObjetoPlano(obj.args)) return { error: 'La clave "args" debe ser un objeto JSON.' };

  const regla = TOOL_ARG_RULES[obj.tool];
  const clavesArgs = Object.keys(obj.args);
  const faltantes = regla.required.filter(k => !(k in obj.args));
  if (faltantes.length) return { error: `Faltan args requeridos para ${obj.tool}: ${faltantes.join(', ')}.` };

  const extras = clavesArgs.filter(k => !regla.allowed.includes(k));
  if (extras.length) return { error: `Args no permitidos para ${obj.tool}: ${extras.join(', ')}.` };

  for (const k of regla.strings || []) {
    if (typeof obj.args[k] !== 'string') return { error: `El arg "${k}" de ${obj.tool} debe ser string.` };
  }
  for (const k of regla.objects || []) {
    if (!esObjetoPlano(obj.args[k])) return { error: `El arg "${k}" de ${obj.tool} debe ser objeto JSON.` };
  }
  if (obj.tool === 'read' && !obj.args.path.trim()) return { error: 'El path de read no puede estar vacío.' };
  if (obj.tool === 'bash' && !obj.args.cmd.trim()) return { error: 'El cmd de bash no puede estar vacío.' };
  if (obj.tool === 'view_describe' && !['scratchpad', 'md-reader', 'canvas'].includes(obj.args.view)) {
    return { error: 'view_describe sólo acepta scratchpad, md-reader o canvas.' };
  }
  if (obj.tool === 'view_invoke' && !['scratchpad', 'md-reader', 'canvas'].includes(obj.args.view)) {
    return { error: 'view_invoke sólo acepta scratchpad, md-reader o canvas.' };
  }

  return { call: { tool: obj.tool, args: obj.args } };
}

// Canal de ejecución estricto: sólo se consideran bloques ```json completos
// que formen un grupo CONTIGUO al final de la respuesta. La explicación puede
// ir antes, pero cualquier ejemplo o JSON incrustado fuera de ese grupo final
// se ignora y jamás se ejecuta. Cada bloque contiene exactamente un objeto.
//
// Fallback: si NO hay fences etiquetados, se aceptan fences SIN etiqueta
// ``` como último recurso, ÚNICAMENTE cuando:
//   • forman un grupo contiguo al final del texto (sin texto posterior);
//   • su contenido es un único objeto JSON válido;
//   //   • pasa completamente validarToolCall;
//   • se mantiene el lote atómico (si alguno falla, se rechaza todo);
//   • múltiples llamadas sólo se permiten si todas son read.
// No se escanea JSON arbitrario dentro del texto.
function extraerBloquesJsonFinales(texto) {
  const src = String(texto || '');
  const bloques = [];
  const rechazados = [];

  // Los delimitadores cuentan sólo cuando ocupan una línea completa.
  // Así, secuencias de backticks dentro de strings JSON o código no cortan
  // accidentalmente el payload de una tool.
  const fence = '```';
  const lineas = src.split('\n');
  const inicios = [];
  let offset = 0;
  for (const linea of lineas) {
    inicios.push(offset);
    offset += linea.length + 1;
  }

  const normalizar = linea => String(linea || '').replace(/\r$/, '').trim();
  const esCierre = linea => normalizar(linea) === fence;
  const tipoApertura = linea => {
    const limpia = normalizar(linea).toLowerCase();
    if (limpia === fence + 'json') return 'json';
    if (limpia === fence) return 'plain';
    return null;
  };

  let i = lineas.length - 1;
  while (i >= 0 && normalizar(lineas[i]) === '') i--;

  // Si la respuesta termina en prosa, no se buscan fences anteriores.
  // Esos bloques son ejemplos o documentación y deben ignorarse sin error.
  if (i < 0 || !esCierre(lineas[i])) {
    return { bloques: [], prefijo: src, rechazados: [] };
  }

  const encontrados = [];
  while (i >= 0 && esCierre(lineas[i])) {
    const cierre = i;
    let apertura = cierre - 1;

    // La apertura válida más cercana debe ser una línea de fence completa.
    while (apertura >= 0 && !tipoApertura(lineas[apertura])) apertura--;
    if (apertura < 0) {
      return {
        bloques: [],
        prefijo: src,
        rechazados: [{
          contenido: '(grupo final)',
          razon: 'Fence de cierre final sin apertura correspondiente.'
        }]
      };
    }

    const tipo = tipoApertura(lineas[apertura]);
    const contenido = lineas.slice(apertura + 1, cierre).join('\n').trim();
    encontrados.unshift({
      contenido,
      tipo,
      inicio: inicios[apertura]
    });

    i = apertura - 1;
    while (i >= 0 && normalizar(lineas[i]) === '') i--;

    // Sólo seguimos si el bloque anterior termina inmediatamente antes,
    // salvo whitespace. La prosa corta el grupo final.
    if (i < 0 || !esCierre(lineas[i])) break;
  }

  if (!encontrados.length) {
    return { bloques: [], prefijo: src, rechazados: [] };
  }

  // Los fences sin etiqueta son fallback. Sólo se aceptan cuando el contenido
  // es inequívocamente una tool válida. Código normal o JSON documental se
  // ignoran silenciosamente, pero una tool reconocible y mal formada se reporta.
  for (const bloque of encontrados) {
    if (bloque.tipo !== 'plain') continue;

    let parsed;
    try {
      parsed = JSON.parse(bloque.contenido);
    } catch {
      return { bloques: [], prefijo: src, rechazados: [] };
    }

    const pareceTool = esObjetoPlano(parsed) &&
      (Object.prototype.hasOwnProperty.call(parsed, 'tool') ||
       Object.prototype.hasOwnProperty.call(parsed, 'args'));

    if (!pareceTool) {
      return { bloques: [], prefijo: src, rechazados: [] };
    }

    const validado = validarToolCall(parsed);
    if (validado.error) {
      rechazados.push({
        contenido: bloque.contenido,
        razon: validado.error
      });
    }
  }

  // Lote atómico: cualquier fallback reconocible pero inválido anula todo.
  if (rechazados.length) {
    return {
      bloques: [],
      prefijo: src.slice(0, encontrados[0].inicio),
      rechazados
    };
  }

  return {
    bloques: encontrados.map(b => b.contenido),
    prefijo: src.slice(0, encontrados[0].inicio),
    rechazados: []
  };
}

function parsearToolCalls(texto) {
  const calls = [];
  const errors = [];
  const src = String(texto || '');
  const { bloques, rechazados } = extraerBloquesJsonFinales(src);

  // Reportar errores explícitos de bloques rechazados (fences sin etiqueta)
  for (const r of (rechazados || [])) {
    if (r.razon === 'JSON inválido') {
      errors.push('Fence final sin etiqueta detectado pero contiene JSON inválido: ' + r.contenido.slice(0, 80) + '. Usá ```json para las tools.');
    } else {
      errors.push('Fence final sin etiqueta detectado pero no es una tool válida: ' + r.razon + '. Usá ```json para las tools.');
    }
  }

  for (const bloque of bloques) {
    if (!bloque) {
      errors.push('El bloque JSON final está vacío. Emití un único objeto válido dentro del bloque.');
      continue;
    }
    try {
      const validado = validarToolCall(JSON.parse(bloque));
      if (validado.error) errors.push(validado.error);
      else calls.push(validado.call);
    } catch (err) {
      errors.push('JSON de tool inválido: ' + err.message + '. Reemitilo como JSON estricto dentro de un bloque final ```json.');
    }
  }

  if (!bloques.length) {
    const trimmed = src.trim();
    const ultimaApertura = trimmed.lastIndexOf('```json');
    if (ultimaApertura >= 0 && trimmed.indexOf('```', ultimaApertura + 7) < 0) {
      errors.push('Bloque JSON de tool incompleto: falta el cierre ```. Reemití el bloque final completo.');
    } else if (/^[\[{]/.test(trimmed) && /["']?tool["']?\s*:/i.test(trimmed)) {
      errors.push('La solicitud de tool no se ejecutó porque no está dentro de un bloque ```json final. Reemitila con el fence requerido.');
    }
  }

  // El grupo final es atómico: una solicitud inválida impide ejecutar las
  // restantes. Así una escritura válida no se aplica parcialmente junto a un
  // segundo bloque defectuoso. La única operación múltiple permitida son
  // lecturas independientes, que el executor procesa en paralelo.
  if (errors.length && calls.length) {
    errors.unshift('Se rechazó el grupo final completo porque contiene al menos una solicitud inválida. No se ejecutó ninguna tool.');
    calls.length = 0;
  }
  if (calls.length > 1 && !calls.every(call => call.tool === 'read')) {
    errors.push('Sólo se permiten múltiples tools cuando todas son read independientes. Para bash, edit, write, forge o vistas, emití una sola tool y esperá su resultado.');
    calls.length = 0;
  }

  return { calls, errors };
}

const MAX_ITER = 999;
// El backend (cloud_tools) ya cap la salida a 50KB. Feedback casi hasta ese
// tope: truncar antes dejaba a la nube sin ver el resultado real (bash/read
// grandes se cortaban a 8KB → la AI trabajaba a ciegas).
const MAX_TOOL_FEEDBACK = 48 * 1024;

const PRIMER =
  'Tenés acceso REAL a la PC del usuario (Linux) con herramientas. Para usar una, ' +
  'emití al FINAL de tu respuesta un bloque de código ```json con el objeto EXACTO {"tool":"NOMBRE","args":{...}} ' +
  '— siempre entre ```json y ``` para que el sistema lo capture bien. Podés escribir una explicación breve antes del bloque, ' +
  'pero no escribas nada después. Este bloque JSON es un canal de EJECUCIÓN REAL: toda aparición válida de las claves reservadas ' +
  '"tool" y "args" se ejecutará, incluso si parece un ejemplo, una cita o documentación. NUNCA uses esas claves reservadas para enseñar ' +
  'un ejemplo; para ejemplos visibles usá nombres ficticios como "herramienta", "argumentos" y "comando". ' +
  'Tools y sus args EXACTOS: read {"path"} (lee un archivo; si el path es una IMAGEN .png/.jpg/.jpeg/.gif/.webp, ' +
  'el sistema te ADJUNTA esa imagen a tu próximo mensaje y la VES de verdad — SÍ tenés visión de imágenes a través de read, ' +
  'NUNCA digas que no podés ver imágenes); bash {"cmd"}; edit {"path","oldText","newText"}; write {"path","content"}; ' +
  'forge_submit {"manifest":{name,version,description,input_schema,permissions,timeout,tests,docs},"code":"handler.py completo"} ' +
  '(crea draft y corre tests aislados; nunca aprueba ni activa sin el humano). ' +
  'view_describe {"view":"scratchpad|md-reader|canvas"}; ' +
  'view_invoke {"view":"...","action":"...","args":{...}} (usa primero view_describe; acciones sensibles esperan aprobación humana). ' +
  'Reglas: usá el nombre de arg EXACTO (bash usa "cmd", no "command"). Podés emitir varias tools read independientes ' +
  'en el mismo turno, cada una en su propio bloque json; Aurora las ejecutará en paralelo y devolverá todos los resultados juntos. ' +
  'No agrupes operaciones dependientes ni escrituras: para ellas usá UNA tool por turno y esperá su resultado. ' +
  'Usá herramientas sólo cuando necesites datos o cambios reales de la PC. ' +
  'Si no necesitás una herramienta, respondé normalmente sin bloque JSON. No afirmes que una acción ocurrió ni inventes resultados ' +
  'antes de recibir la respuesta de la tool. Si una tool devuelve error, leé el mensaje, corregí y reintentá.';

// Prime UNA sola vez por conversación de la nube (persiste en sessionStorage
// para no repetirlo en cada mensaje ni en recargas de Aurora). El LLM lo
// recuerda; repetirlo es ruido.
function yaCebado(convKey) {
  try { return sessionStorage.getItem('cloud_primed_json_v3_' + convKey) === '1'; } catch { return _primed; }
}
function marcarCebado(convKey) {
  try { sessionStorage.setItem('cloud_primed_json_v3_' + convKey, '1'); } catch { _primed = true; }
}
let _primed = false;

// Cuando una respuesta contiene explicación + tool, la UI reemplaza el bloque
// ejecutable por ToolVisualCard. Conservar explícitamente el texto anterior al
// fence; de lo contrario la tarjeta tapa/desaparece toda la explicación.
function separarToolDraft(texto = '') {
  const src = String(texto || '');
  const draft = detectarToolDraft(src);
  if (!draft) return { draft: null, texto: '' };
  const inicio = src.search(/(?:^|```(?:json|pitool)?\s*)(?:json\s*)?\{?\s*"tool"\s*:/i);
  return { draft, texto: inicio > 0 ? src.slice(0, inicio).trim() : '' };
}

function actualizarMensaje(uiId, patch) {
  if (!uiId) return false;
  const arr = historial.value;
  const i = arr.findIndex(m => m._uiId === uiId);
  if (i < 0) return false;
  historial.value = [...arr.slice(0, i), { ...arr[i], ...patch, _uiId: uiId }, ...arr.slice(i + 1)];
  return true;
}
function agregar(msg) { return agregarMensajeRico(msg); }
function actualizarToolCall(callId, patch) {
  const arr = historial.value;
  const i = arr.findIndex(m => m._toolCallId === callId);
  if (i < 0) return;
  historial.value = [...arr.slice(0, i), { ...arr[i], ...patch }, ...arr.slice(i + 1)];
}

// Throttle del streaming: cada chunk re-renderiza TODA la lista de mensajes.
// Con streaming rápido + conversación larga eso congela el main thread. Aplica
// el contenido como mucho cada INTERVALO ms (el texto es acumulativo).
function throttleContenido(uiId, paneId = 'cloud') {
  const INTERVALO = 120;
  let pendiente = null, timer = null, ultimo = 0;
  const aplicar = () => {
    if (pendiente != null) {
      const { draft, texto } = separarToolDraft(pendiente);
      actualizarMensaje(uiId, {
        content: pendiente,
        _toolDraft: draft || undefined,
        _toolText: texto || undefined,
        _working: false,
      });
      if (draft) emitirToolVisual({ ...draft, paneId, transient: true });
    }
    pendiente = null; ultimo = Date.now(); timer = null;
  };
  return {
    push(t) {
      pendiente = t;
      const d = Date.now() - ultimo;
      if (d >= INTERVALO) aplicar();
      else if (!timer) timer = setTimeout(aplicar, INTERVALO - d);
    },
    flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      aplicar();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pendiente = null;
    },
  };
}

async function asegurarConversacion(aiId, url) {
  try {
    const r = await postJSON('/db/llm/cloud/conversaciones', { llm: aiId, url, titulo: aiId });
    return r?.id ?? null;
  } catch { return null; }
}
async function persistir(convId, rol, contenido) {
  if (!convId) return false;
  try {
    await postJSON('/db/llm/cloud/mensajes', { conv_id: convId, rol, contenido });
    return true;
  } catch (_) {
    return false;
  }
}

// Resultado de /pi/cloud-tool ({ok, output, is_error}) → texto para el iframe.
function formatearResultado(r) {
  if (!r?.ok && !r?.output) return 'Tool error: ' + (r?.error || 'unknown');
  return ((r.is_error ? '[ERROR] ' : '') + (r.output || '(sin salida)')).trim();
}

// Display COMPACTO para la burbuja pi-tool. NO meter 5KB de HTML (write) ni 50KB
// (read) al historial: cada re-render de streaming re-parsea TODOS los mensajes
// → con varios grandes acumulados, el main thread se pinea ("congelado"). La
// ejecución ya usó los args/salida reales; en pantalla basta un preview.
function argsCompactos(args) {
  const o = {};
  for (const [k, v] of Object.entries(args || {})) {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    o[k] = s.length > 100 ? s.slice(0, 100) + `…(${s.length})` : s;
  }
  return JSON.stringify(o);
}
function salidaCompacta(s) {
  return s.length > 1200 ? s.slice(0, 1200) + `\n…(+${s.length - 1200} chars)` : s;
}

function nuevoTurnId() {
  try { return `cloud-turn-${crypto.randomUUID()}`; }
  catch { return `cloud-turn-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function normalizarTurnoCloud(turno) {
  if (!turno) return null;
  return {
    ...turno,
    turnId: turno.turnId || turno.turn_id,
    convId: turno.convId ?? turno.conv_id,
    aiId: turno.aiId || turno.ai_id,
    paneId: turno.paneId || turno.pane_id || 'cloud',
    requestId: turno.requestId || turno.request_id,
    nextPrompt: turno.nextPrompt ?? turno.next_prompt,
    iteration: Number(turno.iteration || 0),
    state: turno.state && typeof turno.state === 'object' ? turno.state : {},
  };
}

async function guardarTurnoCloud(turnId, data = {}) {
  const r = await postJSON('/pi/cloud-turn/save', {
    turnId,
    paneId: 'cloud',
    ...data,
  });
  if (!r?.ok) throw new Error(r?.error || 'No se pudo guardar el journal Cloud.');
  return r;
}

async function completarTurnoCloud(turnId, status = 'completed') {
  try {
    return await postJSON('/pi/cloud-turn/complete', { turnId, status });
  } catch {
    return null;
  }
}

function resultadoToolPersistible(r, salida, esError, feedback, image) {
  return {
    feedback,
    image: image || undefined,
    salida,
    esError: !!esError,
    raw: {
      ok: r?.ok !== false,
      is_error: !!(r?.is_error || esError),
      output: r?.output || salida,
      status: r?.status,
      replayed: !!r?.replayed,
      is_image: !!r?.is_image,
    },
  };
}

export async function recuperarCloudPendiente({ iframe } = {}) {
  if (cloudGenerando.value) return { resumed: false, reason: 'busy' };
  const r = await postJSON('/pi/cloud-turn/recover', { paneId: 'cloud' });
  const turn = normalizarTurnoCloud(r?.turn);
  if (!turn) return { resumed: false, reason: 'none' };

  await enviarACloud({
    iframe,
    texto: turn.prompt || turn.nextPrompt || '',
    aiId: turn.aiId,
    url: turn.url,
    resume: { turn, calls: r.calls || [] },
  });
  return { resumed: true, turnId: turn.turnId, aiId: turn.aiId, url: turn.url };
}

export async function enviarACloud({ iframe, texto, aiId, url, images, files, resume = null }) {
  const turnoPrevio = normalizarTurnoCloud(resume?.turn);
  const retomando = !!turnoPrevio;
  const turnId = turnoPrevio?.turnId || nuevoTurnId();

  if (!retomando) {
    agregar({
      role: 'user',
      content: texto,
      _imagenes: images?.length ? images : undefined,
      _adjuntos: (files?.length || 0) || undefined,
    });
  }

  cargando.value = true;
  cloudGenerando.value = true;

  const convId = turnoPrevio?.convId ?? await asegurarConversacion(aiId, url);
  aiId = turnoPrevio?.aiId || aiId;
  url = turnoPrevio?.url || url;

  // Primer sólo en turnos nuevos. En recuperación se usa el prompt exacto que
  // quedó persistido, incluido el cebado si correspondía.
  let prompt;
  if (retomando) {
    prompt = turnoPrevio.status === 'feedback_ready'
      ? (turnoPrevio.nextPrompt || turnoPrevio.prompt || texto)
      : (turnoPrevio.prompt || texto);
  } else {
    const convKey = (() => { try { return new URL(url).host; } catch { return aiId || 'cloud'; } })();
    prompt = yaCebado(convKey) ? texto : `${PRIMER}\n\n${texto}`;
    marcarCebado(convKey);
    await guardarTurnoCloud(turnId, {
      convId, aiId, url, status: 'prepared', iteration: 0, prompt,
      state: { originalText: texto, adjImgs: images, adjFiles: files },
    });
    await persistir(convId, 'user', texto);
  }

  let adjImgs = retomando ? turnoPrevio.state?.adjImgs : images;
  let adjFiles = retomando ? turnoPrevio.state?.adjFiles : files;
  let ultimoErrorFormato = '';
  let repeticionesFormato = 0;
  let assistantUiIdActual = null;
  let iterInicial = turnoPrevio?.iteration || 0;
  let estadoRetomado = turnoPrevio?.status || null;
  let stateRetomado = turnoPrevio?.state || {};

  if (estadoRetomado === 'feedback_ready') {
    iterInicial += 1;
    estadoRetomado = null;
    stateRetomado = {};
    adjImgs = turnoPrevio.state?.adjImgs;
    adjFiles = undefined;
  }

  try {
    for (let iter = iterInicial; iter < MAX_ITER; iter++) {
      const recuperandoEstaIter = retomando && iter === iterInicial && !!estadoRetomado;
      const placeholder = agregar({
        role: 'assistant', content: '', _via: 'direct-ai',
        _toolIter: iter + 1, _toolMax: MAX_ITER,
      });
      assistantUiIdActual = placeholder?._uiId || null;
      const t0 = Date.now();
      const fr = document.querySelector('iframe[data-pane="cloud"]') || iframe;
      const thr = throttleContenido(assistantUiIdActual, 'cloud');

      let res;
      let estadoIter = recuperandoEstaIter ? estadoRetomado : null;
      let stateIter = recuperandoEstaIter ? { ...stateRetomado } : {};
      const requestId = recuperandoEstaIter && turnoPrevio?.requestId
        ? turnoPrevio.requestId
        : `${turnId}:ask:${iter}`;

      if ((estadoIter === 'answer_received' || estadoIter === 'executing_tools') && stateIter.answer) {
        res = stateIter.answer;
      } else {
        await guardarTurnoCloud(turnId, {
          convId, aiId, url, status: 'awaiting_answer', iteration: iter,
          requestId, prompt,
          state: { ...stateIter, adjImgs, adjFiles },
        });

        res = await askCloud(fr, prompt, {
          onChunk: p => thr.push(p),
          images: adjImgs,
          files: adjFiles,
          manualAck: true,
          requestId,
          resumeOnly: recuperandoEstaIter && (estadoIter === 'prepared' || estadoIter === 'awaiting_answer'),
        });
        thr.flush();
        adjImgs = undefined;
        adjFiles = undefined;

        stateIter = {
          ...stateIter,
          answer: {
            ok: !!res.ok,
            text: res.text || '',
            images: res.images,
            respondeMs: res.respondeMs,
            generaMs: res.generaMs,
            reason: res.reason,
            paneId: res.paneId || 'cloud',
            requestId,
            replayed: !!res.replayed,
          },
          adjImgs: undefined,
          adjFiles: undefined,
        };
        await guardarTurnoCloud(turnId, {
          convId, aiId, url, status: 'answer_received', iteration: iter,
          requestId, prompt, state: stateIter,
        });
        // El ACK ocurre sólo después de que la respuesta existe en SQLite.
        confirmarCloudAnswer(requestId, res.paneId || 'cloud');
      }

      thr.flush();
      const final = res.text || '';
      const contenidoError = final || `Error: no se detectó respuesta de ${aiId || 'Cloud'}.`;

      if ((!res.ok || !final || final === '(sin respuesta detectada)') && !res.images?.length) {
        actualizarMensaje(assistantUiIdActual, { content: contenidoError, _toolError: true });
        if (!stateIter.answerPersisted && await persistir(convId, 'assistant', contenidoError)) {
          stateIter.answerPersisted = true;
          await guardarTurnoCloud(turnId, {
            convId, aiId, url, status: 'answer_received', iteration: iter,
            requestId, prompt, state: stateIter,
          });
        }
        await completarTurnoCloud(turnId, 'failed');
        break;
      }

      const contenidoFinal = res.images?.length && /^(thinking|reasoning|pensando|razonando)\.?$/i.test(final.trim())
        ? '' : final;
      const toolDraftFinal = separarToolDraft(contenidoFinal);
      actualizarMensaje(assistantUiIdActual, {
        content: contenidoFinal,
        _toolDraft: toolDraftFinal.draft || undefined,
        _toolText: toolDraftFinal.texto || undefined,
        _imagenes: res.images?.length ? res.images : undefined,
        _timing: { responde: res.respondeMs, genera: res.generaMs, rt: Date.now() - t0 },
      });

      if (!stateIter.answerPersisted && await persistir(convId, 'assistant', final)) {
        stateIter.answerPersisted = true;
        await guardarTurnoCloud(turnId, {
          convId, aiId, url, status: 'answer_received', iteration: iter,
          requestId, prompt, state: stateIter,
        });
      }

      const parsedTools = parsearToolCalls(final);
      const calls = parsedTools.calls;
      if (!calls.length && !parsedTools.errors.length) {
        await completarTurnoCloud(turnId, 'completed');
        break;
      }

      const firmaError = parsedTools.errors.join('|');
      if (!calls.length && firmaError) {
        repeticionesFormato = firmaError === ultimoErrorFormato ? repeticionesFormato + 1 : 1;
        ultimoErrorFormato = firmaError;
        if (repeticionesFormato >= 3) {
          const visual = toolVisual({
            tool: 'cortacircuito', status: 'error',
            error: `${aiId || 'Cloud'} repitió ${repeticionesFormato} veces la misma tool inválida.`,
            paneId: 'cloud',
          });
          emitirToolVisual(visual);
          agregar({
            role: 'assistant', _via: 'pi-tool', _toolError: true,
            content: `🔧 cortacircuito\n\n[ERROR] ${aiId || 'Cloud'} repitió ${repeticionesFormato} veces la misma tool inválida. Se detuvo el loop.`,
            _toolVisual: visual,
          });
          await completarTurnoCloud(turnId, 'failed');
          break;
        }
      } else {
        ultimoErrorFormato = '';
        repeticionesFormato = 0;
      }

      const resultados = [];
      for (const error of parsedTools.errors) {
        const visual = toolVisual({ tool: 'tool inválida', status: 'error', error, paneId: 'cloud' });
        emitirToolVisual(visual);
        agregar({
          role: 'assistant', _via: 'pi-tool', _toolError: true,
          _toolIter: iter + 1, _toolMax: MAX_ITER,
          content: `🔧 tool inválida · iteración ${iter + 1}/${MAX_ITER}\n\n[ERROR] ${error}`,
          _toolVisual: visual,
        });
        resultados.push('Tool request error: ' + error);
      }

      const resultadosGuardados = Array.isArray(stateIter.toolResults)
        ? [...stateIter.toolResults]
        : [];
      stateIter = {
        ...stateIter,
        calls,
        parseErrors: parsedTools.errors,
        toolResults: resultadosGuardados,
      };
      await guardarTurnoCloud(turnId, {
        convId, aiId, url, status: 'executing_tools', iteration: iter,
        requestId, prompt, state: stateIter,
      });

      const prepararCall = (call, indice) => {
        const etiqueta = `🔧 ${call.tool} ${argsCompactos(call.args)}`;
        const callId = `cloud-tool-${turnId}-${iter}-${indice}`;
        const visual = toolVisual({ tool: call.tool, args: call.args, status: 'running', paneId: 'cloud' });
        emitirToolVisual(visual);
        agregar({
          role: 'assistant', _via: 'pi-tool', _toolIter: iter + 1, _toolMax: MAX_ITER,
          _toolCallId: callId,
          content: `${etiqueta}\n\nIteración ${iter + 1}/${MAX_ITER} · ejecutando…`,
          _toolVisual: visual,
        });
        return { call, etiqueta, callId, indice };
      };

      const mostrarResultadoGuardado = ({ call, etiqueta, callId }, guardado) => {
        const raw = guardado.raw || { ok: !guardado.esError, is_error: guardado.esError, output: guardado.salida };
        const terminado = toolVisual({
          tool: call.tool, args: call.args,
          status: guardado.esError ? 'error' : 'success',
          result: raw, paneId: 'cloud',
        });
        emitirToolVisual(terminado);
        actualizarToolCall(callId, {
          content: `${etiqueta}\n\n${guardado.image ? guardado.salida : salidaCompacta(guardado.salida || '')}`,
          _imagen: guardado.image,
          _toolError: !!guardado.esError,
          _toolVisual: terminado,
        });
        return guardado;
      };

      const ejecutarPreparada = async meta => {
        const { call, etiqueta, callId, indice } = meta;
        const yaGuardado = resultadosGuardados[indice];
        if (yaGuardado?.feedback) return mostrarResultadoGuardado(meta, yaGuardado);

        let salida;
        let esError = false;
        let r;
        try {
          r = call.tool === 'forge_submit'
            ? await submitForge(call.args)
            : call.tool === 'view_describe' || call.tool === 'view_invoke'
              ? await postJSON(`/tools/${call.tool}/run`, { arguments: call.args })
              : await postJSON('/pi/cloud-tool', {
                  tool: call.tool,
                  args: call.args,
                  callId,
                  turnId,
                  iteration: iter,
                  ordinal: indice,
                });
          if ((call.tool === 'view_describe' || call.tool === 'view_invoke') && !r.output) {
            r = { ...r, is_error: r.ok === false, output: JSON.stringify(r.result ?? r, null, 2) };
          }
          salida = formatearResultado(r);
          esError = !!(r?.is_error || r?.ok === false);
        } catch (err) {
          salida = 'Error llamando a pi: ' + (err?.message || err);
          esError = true;
          r = { ok: false, is_error: true, output: salida };
        }

        let feedback;
        if (r?.is_image && r.image) {
          feedback = `Tool "${call.tool}" result: la imagen se adjunta abajo, míra la imagen.`;
        } else {
          const compacto = salida.length > MAX_TOOL_FEEDBACK
            ? salida.slice(0, MAX_TOOL_FEEDBACK) + `\n…[truncado: ${salida.length - MAX_TOOL_FEEDBACK} caracteres omitidos]`
            : salida;
          feedback = `Tool "${call.tool}" result:\n\n${compacto}`;
        }

        const guardado = resultadoToolPersistible(r, salida, esError, feedback, r?.image);
        resultadosGuardados[indice] = guardado;
        stateIter.toolResults = resultadosGuardados;

        // Para read/bash/edit/write, el resultado ya está durable en el journal
        // del backend antes de esta escritura. Si Aurora cae acá, el mismo callId
        // devuelve exactamente ese resultado sin reejecutar la tool.
        await guardarTurnoCloud(turnId, {
          convId, aiId, url, status: 'executing_tools', iteration: iter,
          requestId, prompt, state: stateIter,
        });
        return mostrarResultadoGuardado(meta, guardado);
      };

      for (let i = 0; i < calls.length; i++) {
        const resultado = await ejecutarPreparada(prepararCall(calls[i], i));
        if (resultado?.image) (adjImgs ||= []).push(resultado.image);
        resultados.push(resultado?.feedback || 'Tool error: resultado vacío');
      }

      prompt = resultados.join('\n\n---\n\n') +
        '\n\nContinue with the task using these results. If you need another tool, emit its ```json; otherwise give your final answer.';

      await guardarTurnoCloud(turnId, {
        convId, aiId, url, status: 'feedback_ready', iteration: iter,
        requestId, prompt: turnoPrevio?.prompt || texto, nextPrompt: prompt,
        state: { ...stateIter, adjImgs },
      });

      if (iter === MAX_ITER - 1) {
        const visual = toolVisual({
          tool: 'límite', status: 'error', error: `Se alcanzó MAX_ITER=${MAX_ITER}.`, paneId: 'cloud',
        });
        emitirToolVisual(visual);
        agregar({
          role: 'assistant', _via: 'pi-tool', _toolError: true,
          _toolIter: iter + 1, _toolMax: MAX_ITER,
          content: `🔧 límite de seguridad\n\n[ERROR] Se alcanzó MAX_ITER=${MAX_ITER}. El loop Cloud se detuvo para evitar una ejecución infinita.`,
          _toolVisual: visual,
        });
        await completarTurnoCloud(turnId, 'failed');
        break;
      }

      estadoRetomado = null;
      stateRetomado = {};
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    actualizarMensaje(assistantUiIdActual, { content: 'Error: ' + (err?.message || err) });
    // No marcar terminal automáticamente: ante una caída de red/iframe, el
    // snapshot queda disponible para reanudar en el próximo montaje.
  } finally {
    cargando.value = false;
    cloudGenerando.value = false;
    if (assistantUiIdActual) {
      const arr = historial.value;
      const msg = arr.find(m => m._uiId === assistantUiIdActual);
      if (msg?.role === 'assistant' && msg._via === 'direct-ai' && !(msg.content || '').trim()) {
        historial.value = arr.filter(m => m._uiId !== assistantUiIdActual);
      }
    }
  }

  return { turnId, resumed: retomando };
}
