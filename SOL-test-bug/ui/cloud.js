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
import { askCloud } from '../../../../components/shared/cloud-ask.js';
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
function extraerBloquesJsonFinales(texto) {
  const src = String(texto || '');
  const bloques = [];
  let cursor = src.length;

  const retrocederEspacios = () => {
    while (cursor > 0 && /\s/.test(src[cursor - 1])) cursor--;
  };
  retrocederEspacios();

  while (cursor >= 3 && src.slice(cursor - 3, cursor) === '```') {
    const cierre = cursor - 3;
    const apertura = src.lastIndexOf('```json', cierre - 1);
    if (apertura < 0) break;

    const cabecera = src.slice(apertura, cierre).match(/^```json[ \t]*\r?\n/i);
    if (!cabecera) break;

    const inicioContenido = apertura + cabecera[0].length;
    const contenido = src.slice(inicioContenido, cierre);
    // Un fence interno indicaría que `apertura` no corresponde realmente a
    // este cierre. En ese caso no arriesgamos una interpretación ambigua.
    if (contenido.includes('```')) break;

    bloques.unshift(contenido.trim());
    cursor = apertura;
    retrocederEspacios();
  }

  return { bloques, prefijo: src.slice(0, cursor) };
}

function parsearToolCalls(texto) {
  const calls = [];
  const errors = [];
  const src = String(texto || '');
  const { bloques } = extraerBloquesJsonFinales(src);

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
const MAX_TOOL_FEEDBACK = 8 * 1024;

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
      const draft = detectarToolDraft(pendiente);
      actualizarMensaje(uiId, { content: pendiente, _toolDraft: draft || undefined, _working: false });
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
  if (!convId) return;
  try { await postJSON('/db/llm/cloud/mensajes', { conv_id: convId, rol, contenido }); } catch (_) {}
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

export async function enviarACloud({ iframe, texto, aiId, url, images, files }) {
  agregar({ role: 'user', content: texto, _imagenes: images?.length ? images : undefined, _adjuntos: (files?.length || 0) || undefined });

  cargando.value = true;
  cloudGenerando.value = true;
  const convId = await asegurarConversacion(aiId, url);
  await persistir(convId, 'user', texto);

  // Primer una sola vez por host de la nube (no repetir a cada rato).
  const convKey = (() => { try { return new URL(url).host; } catch { return aiId || 'cloud'; } })();
  let prompt = yaCebado(convKey) ? texto : `${PRIMER}\n\n${texto}`;
  marcarCebado(convKey);

  // Adjuntos para el PRÓXIMO askCloud. Arrancan con lo que mandó el usuario;
  // en el loop se recargan si un `read` devuelve una imagen (tool-vision: la
  // nube pide ver una imagen del disco → se la adjuntamos, no una descripción).
  let adjImgs = images, adjFiles = files;
  let ultimoErrorFormato = '', repeticionesFormato = 0;
  let assistantUiIdActual = null;
  try {
    for (let iter = 0; iter < MAX_ITER; iter++) {
      const placeholder = agregar({ role: 'assistant', content: '', _via: 'direct-ai', _toolIter: iter + 1, _toolMax: MAX_ITER });
      assistantUiIdActual = placeholder?._uiId || null;
      const t0 = Date.now();
      // Re-query FRESCO cada iteración: la referencia capturada al inicio queda
      // stale si la app re-renderiza el iframe entre turnos (contentWindow
      // muerto → el ASK no llega → askCloud cuelga). Este era el bug del loop.
      const fr = document.querySelector('iframe[data-pane="cloud"]') || iframe;
      // Un solo ASK por turno. Reenviar al fallar la captura duplicaba mensajes
      // y podía ejecutar una tool dos veces. El handshake de askCloud cubre la
      // carrera de carga; cualquier fallo restante se muestra al usuario.
      const thr = throttleContenido(assistantUiIdActual, 'cloud');
      const res = await askCloud(fr, prompt, {
        onChunk: p => thr.push(p), images: adjImgs, files: adjFiles,
      });
      thr.flush();
      adjImgs = undefined; adjFiles = undefined;   // consumidos
      const final = res.text || '';
      // Respuesta SOLO-imagen (generada, sin texto) es válida: no descartarla.
      if ((!res.ok || !final || final === '(sin respuesta detectada)') && !res.images?.length) {
        actualizarMensaje(assistantUiIdActual, {
          content: final || `Error: no se detectó respuesta de ${aiId || 'Cloud'}.`,
          _toolError: true,
        });
        break;
      }
      // Respuesta solo-imagen: no dejar el placeholder "Thinking" como texto.
      const contenidoFinal = res.images?.length && /^(thinking|reasoning|pensando|razonando)\.?$/i.test(final.trim())
        ? '' : final;
      actualizarMensaje(assistantUiIdActual, { content: contenidoFinal, _toolDraft: detectarToolDraft(contenidoFinal) || undefined,
        _imagenes: res.images?.length ? res.images : undefined,
        _timing: { responde: res.respondeMs, genera: res.generaMs, rt: Date.now() - t0 } });
      await persistir(convId, 'assistant', final);

      const parsedTools = parsearToolCalls(final);
      const calls = parsedTools.calls;
      if (!calls.length && !parsedTools.errors.length) break;   // turno normal terminado

      const firmaError = parsedTools.errors.join('|');
      if (!calls.length && firmaError) {
        repeticionesFormato = firmaError === ultimoErrorFormato ? repeticionesFormato + 1 : 1;
        ultimoErrorFormato = firmaError;
        if (repeticionesFormato >= 3) {
          const visual = toolVisual({ tool: 'cortacircuito', status: 'error',
            error: `${aiId || 'Cloud'} repitió ${repeticionesFormato} veces la misma tool inválida.`, paneId: 'cloud' });
          emitirToolVisual(visual);
          agregar({ role: 'assistant', _via: 'pi-tool', _toolError: true,
            content: `🔧 cortacircuito\n\n[ERROR] ${aiId || 'Cloud'} repitió ${repeticionesFormato} veces la misma tool inválida. Se detuvo el loop.`,
            _toolVisual: visual });
          break;
        }
      } else {
        ultimoErrorFormato = '';
        repeticionesFormato = 0;
      }

      // Varias lecturas independientes se ejecutan en paralelo. Cualquier lote
      // que contenga otra tool conserva el orden secuencial para evitar carreras.
      const resultados = [];
      for (const error of parsedTools.errors) {
        const visual = toolVisual({ tool: 'tool inválida', status: 'error', error, paneId: 'cloud' });
        emitirToolVisual(visual);
        agregar({ role: 'assistant', _via: 'pi-tool', _toolError: true, _toolIter: iter + 1, _toolMax: MAX_ITER,
          content: `🔧 tool inválida · iteración ${iter + 1}/${MAX_ITER}

[ERROR] ${error}`, _toolVisual: visual });
        resultados.push('Tool request error: ' + error);
      }

      const prepararCall = (call, indice) => {
        const etiqueta = `🔧 ${call.tool} ${argsCompactos(call.args)}`;
        const callId = `cloud-tool-${Date.now()}-${iter}-${indice}`;
        const visual = toolVisual({ tool: call.tool, args: call.args, status: 'running', paneId: 'cloud' });
        emitirToolVisual(visual);
        agregar({ role: 'assistant', _via: 'pi-tool', _toolIter: iter + 1, _toolMax: MAX_ITER,
          _toolCallId: callId, content: `${etiqueta}

Iteración ${iter + 1}/${MAX_ITER} · ejecutando…`, _toolVisual: visual });
        return { call, etiqueta, callId };
      };

      const ejecutarPreparada = async ({ call, etiqueta, callId }) => {
        let salida, esError = false, r;
        try {
          r = call.tool === 'forge_submit'
            ? await submitForge(call.args)
            : call.tool === 'view_describe' || call.tool === 'view_invoke'
            ? await postJSON(`/tools/${call.tool}/run`, { arguments: call.args })
            : await postJSON('/pi/cloud-tool', { tool: call.tool, args: call.args });
          if ((call.tool === 'view_describe' || call.tool === 'view_invoke') && !r.output) {
            r = { ...r, is_error: r.ok === false, output: JSON.stringify(r.result ?? r, null, 2) };
          }
          salida = formatearResultado(r);
          esError = !!(r?.is_error || r?.ok === false);
        } catch (err) {
          salida = 'Error llamando a pi: ' + (err?.message || err);
          esError = true;
        }

        if (r?.is_image && r.image) {
          const terminado = toolVisual({ tool: call.tool, args: call.args, status: esError ? 'error' : 'success', result: r, paneId: 'cloud' });
          emitirToolVisual(terminado);
          actualizarToolCall(callId, { content: `${etiqueta}

${salida}`, _imagen: r.image,
            _toolError: esError, _toolVisual: terminado });
          return { image: r.image, feedback: `Tool "${call.tool}" result: la imagen se adjunta abajo, míra la imagen.` };
        }

        const terminado = toolVisual({ tool: call.tool, args: call.args, status: esError ? 'error' : 'success',
          result: r || { ok: !esError, output: salida }, paneId: 'cloud' });
        emitirToolVisual(terminado);
        actualizarToolCall(callId, { content: `${etiqueta}

${salidaCompacta(salida)}`,
          _toolError: esError, _toolVisual: terminado });
        const feedback = salida.length > MAX_TOOL_FEEDBACK
          ? salida.slice(0, MAX_TOOL_FEEDBACK) + `
…[truncado: ${salida.length - MAX_TOOL_FEEDBACK} caracteres omitidos]`
          : salida;
        return { feedback: `Tool "${call.tool}" result:

${feedback}` };
      };

      const consumir = resultado => {
        if (resultado?.image) (adjImgs ||= []).push(resultado.image);
        resultados.push(resultado?.feedback || 'Tool error: resultado vacío');
      };

      const soloLecturasParalelas = calls.length > 1 && calls.every(call => call.tool === 'read');
      if (soloLecturasParalelas) {
        const preparadas = calls.map(prepararCall);
        const settled = await Promise.allSettled(preparadas.map(ejecutarPreparada));
        for (const estado of settled) {
          if (estado.status === 'fulfilled') consumir(estado.value);
          else resultados.push('Tool error: ' + (estado.reason?.message || estado.reason || 'fallo desconocido'));
        }
      } else {
        for (let i = 0; i < calls.length; i++) {
          consumir(await ejecutarPreparada(prepararCall(calls[i], i)));
        }
      }
      // Feedback: pedir explícitamente que continúe (un `[Resultado]` seco a
      // veces daba respuesta vacía — Gemini no sabía que debía seguir).
      prompt = resultados.join('\n\n---\n\n') +
        '\n\nContinue with the task using these results. If you need another tool, emit its ```json; otherwise give your final answer.';
      if (iter === MAX_ITER - 1) {
        const visual = toolVisual({ tool: 'límite', status: 'error',
          error: `Se alcanzó MAX_ITER=${MAX_ITER}.`, paneId: 'cloud' });
        emitirToolVisual(visual);
        agregar({ role: 'assistant', _via: 'pi-tool', _toolError: true, _toolIter: iter + 1, _toolMax: MAX_ITER,
          content: `🔧 límite de seguridad\n\n[ERROR] Se alcanzó MAX_ITER=${MAX_ITER}. El loop Cloud se detuvo para evitar una ejecución infinita.`,
          _toolVisual: visual });
        break;
      }
      // Gemini necesita un frame corto para rearmar el composer después de
      // cerrar el turno. Sin esto el siguiente ASK llegaba ~40ms después y no
      // aceptaba ni botón ni Enter. Es UN solo timer (no polling); medido en
      // background: 300ms nominales ≈320ms reales. 500ms da margen estable.
      await new Promise(r => setTimeout(r, 500));
    }
  } catch (err) {
    actualizarMensaje(assistantUiIdActual, { content: 'Error: ' + (err?.message || err) });
  } finally {
    cargando.value = false;
    cloudGenerando.value = false;
    // Limpiar sólo la burbuja direct-ai propia si quedó vacía. Otro mensaje
    // puede haberse agregado mientras la nube esperaba y no debe tocarse.
    if (assistantUiIdActual) {
      const arr = historial.value;
      const msg = arr.find(m => m._uiId === assistantUiIdActual);
      if (msg?.role === 'assistant' && msg._via === 'direct-ai' && !(msg.content || '').trim()) {
        historial.value = arr.filter(m => m._uiId !== assistantUiIdActual);
      }
    }
  }
}
