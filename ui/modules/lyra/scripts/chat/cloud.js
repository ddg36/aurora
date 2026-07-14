// Envío al Cloud Backend (LLM externo en iframe) desde el chat de Lyra.
// La respuesta aparece en el mismo hilo pero marcada _via:'direct-ai' (visual
// distinto) y NUNCA toca a pi: no llama sendToLyra ni guarda en la tabla
// `mensajes` (contexto de pi). Su memoria vive aparte en cloud_mensajes.
//
// Tools: el LLM de la nube puede pedir las herramientas REALES de pi
// (read/bash/edit/write) escribiendo un bloque ```pitool con JSON. Un pi
// DEDICADO las ejecuta (POST /pi/cloud-tool, sesión propia — "engaño": pi
// cree que es tarea suya) y el resultado vuelve al iframe. Loop agéntico.

import { historial, cargando, cloudGenerando } from './mensajes.js';
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

// Reconocedor: busca TODOS los objetos JSON {"tool":...,"args":...} en la
// respuesta (Gemini a veces emite 2 en un turno), vengan en bloque ```json o
// sueltos. NO depende del lenguaje del fence. Extractor de llaves balanceadas
// desde cada `{"tool"` — robusto a JSON anidado (args con HTML enorme).
function parsearToolCalls(texto) {
  const calls = [];
  const errors = [];
  let from = 0;
  while (from < texto.length) {
    const rel = texto.slice(from).search(/\{\s*"tool"\s*:/);
    if (rel < 0) break;
    const idx = from + rel;
    let depth = 0, fin = -1, enStr = false, esc = false;
    for (let i = idx; i < texto.length; i++) {
      const ch = texto[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { enStr = !enStr; continue; }
      if (enStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { fin = i; break; } }
    }
    if (fin < 0) {
      errors.push('JSON de tool incompleto: falta cerrar una o más llaves. Emití nuevamente un único objeto JSON válido.');
      break;
    }
    try {
      const obj = JSON.parse(texto.slice(idx, fin + 1));
      if (!obj || typeof obj.tool !== 'string') {
        errors.push('La tool debe incluir "tool" como string y "args" como objeto.');
      } else if (!(obj.tool in TOOLS_PI)) {
        errors.push(`Tool desconocida "${obj.tool}". Válidas: ${Object.keys(TOOLS_PI).join(', ')}.`);
      } else {
        calls.push({ tool: obj.tool, args: obj.args || {} });
      }
    } catch (err) {
      errors.push('JSON de tool inválido: ' + err.message + '. Emitilo nuevamente como JSON estricto.');
    }
    from = fin + 1;
  }
  // También reconocer la INTENCIÓN de tool con JSON no estricto (`{tool:...}`
  // o comillas simples). No podemos ejecutarlo con seguridad, pero sí devolver
  // feedback para que el LLM lo reemita correctamente en el próximo turno.
  if (!calls.length && !errors.length && /\{\s*["']?tool["']?\s*:/i.test(texto)) {
    errors.push('Parece una tool pero no es JSON estricto. Usá comillas dobles en claves y strings: {"tool":"read","args":{"path":"..."}}.');
  }
  // ChatGPT puede cortar ocasionalmente la generación apenas en `{"`. No es
  // una respuesta final: devolver feedback le permite reemitir el JSON entero.
  if (!calls.length && !errors.length && texto.trim().startsWith('{')) {
    let balance = 0;
    for (const ch of texto) balance += ch === '{' ? 1 : ch === '}' ? -1 : 0;
    if (balance !== 0 || texto.trim().length < 8) {
      errors.push('JSON de tool incompleto; reemití un único objeto completo con tool y args.');
    }
  }
  return { calls, errors };
}

const MAX_ITER = 6;
const MAX_TOOL_FEEDBACK = 8 * 1024;

const PRIMER =
  'Tenés acceso REAL a la PC del usuario (Linux) con herramientas. Para usar una, ' +
  'emití un bloque de código ```json con el objeto EXACTO {"tool":"NOMBRE","args":{...}} ' +
  '— siempre entre ```json y ``` para que el sistema lo capture bien. Tools y sus args EXACTOS: ' +
  'read {"path"} (lee un archivo; si el path es una IMAGEN .png/.jpg/.jpeg/.gif/.webp, el sistema te ADJUNTA esa imagen a tu próximo mensaje y la VES de verdad — SÍ tenés visión de imágenes a través de read, NUNCA digas que no podés ver imágenes); ' +
  'bash {"cmd"}; edit {"path","oldText","newText"}; write {"path","content"}; ' +
  'forge_submit {"manifest":{name,version,description,input_schema,permissions,timeout,tests,docs},"code":"handler.py completo"} ' +
  '(crea draft y corre tests aislados; nunca aprueba ni activa sin el humano). ' +
  'view_describe {"view":"scratchpad|md-reader|canvas"}; ' +
  'view_invoke {"view":"...","action":"...","args":{...}} (usa primero view_describe; acciones sensibles esperan aprobación humana). ' +
  'Reglas: usá el nombre de arg EXACTO (bash usa "cmd", no "command"). Preferí UNA tool por turno ' +
  'y esperá su resultado (llega como mensaje nuevo) antes de la siguiente. SOLO cuando necesites ' +
  'datos reales de la PC. Si una tool devuelve error, leé el mensaje, corregí y reintentá.';

// Prime UNA sola vez por conversación de la nube (persiste en sessionStorage
// para no repetirlo en cada mensaje ni en recargas de Aurora). El LLM lo
// recuerda; repetirlo es ruido.
function yaCebado(convKey) {
  try { return sessionStorage.getItem('cloud_primed_' + convKey) === '1'; } catch { return _primed; }
}
function marcarCebado(convKey) {
  try { sessionStorage.setItem('cloud_primed_' + convKey, '1'); } catch { _primed = true; }
}
let _primed = false;

function actualizarUltimo(patch) {
  const arr = historial.value;
  if (!arr.length) return;
  historial.value = [...arr.slice(0, -1), { ...arr[arr.length - 1], ...patch }];
}
function agregar(msg) { historial.value = [...historial.value, { ts: Date.now(), ...msg }]; }

// Throttle del streaming: cada chunk re-renderiza TODA la lista de mensajes.
// Con streaming rápido + conversación larga eso congela el main thread. Aplica
// el contenido como mucho cada INTERVALO ms (el texto es acumulativo).
function throttleContenido(paneId = 'cloud') {
  const INTERVALO = 120;
  let pendiente = null, timer = null, ultimo = 0;
  const aplicar = () => {
    if (pendiente != null) {
      const draft = detectarToolDraft(pendiente);
      actualizarUltimo({ content: pendiente, _toolDraft: draft || undefined, _working: false });
      if (draft) emitirToolVisual({ ...draft, paneId, transient: true });
    }
    pendiente = null; ultimo = Date.now(); timer = null;
  };
  return {
    push(t) { pendiente = t; const d = Date.now() - ultimo; if (d >= INTERVALO) aplicar(); else if (!timer) timer = setTimeout(aplicar, INTERVALO - d); },
    flush() { if (timer) { clearTimeout(timer); timer = null; } pendiente = null; },
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
  try {
    for (let iter = 0; iter < MAX_ITER; iter++) {
      agregar({ role: 'assistant', content: '', _via: 'direct-ai', _toolIter: iter + 1, _toolMax: MAX_ITER });
      const t0 = Date.now();
      // Re-query FRESCO cada iteración: la referencia capturada al inicio queda
      // stale si la app re-renderiza el iframe entre turnos (contentWindow
      // muerto → el ASK no llega → askCloud cuelga). Este era el bug del loop.
      const fr = document.querySelector('iframe[data-pane="cloud"]') || iframe;
      // Un solo ASK por turno. Reenviar al fallar la captura duplicaba mensajes
      // y podía ejecutar una tool dos veces. El handshake de askCloud cubre la
      // carrera de carga; cualquier fallo restante se muestra al usuario.
      const thr = throttleContenido('cloud');
      const res = await askCloud(fr, prompt, {
        onChunk: p => thr.push(p), images: adjImgs, files: adjFiles,
      });
      thr.flush();
      adjImgs = undefined; adjFiles = undefined;   // consumidos
      const final = res.text || '';
      // Respuesta SOLO-imagen (generada, sin texto) es válida: no descartarla.
      if ((!res.ok || !final || final === '(sin respuesta detectada)') && !res.images?.length) {
        actualizarUltimo({
          content: final || `Error: no se detectó respuesta de ${aiId || 'Cloud'}.`,
          _toolError: true,
        });
        break;
      }
      // Respuesta solo-imagen: no dejar el placeholder "Thinking" como texto.
      const contenidoFinal = res.images?.length && /^(thinking|reasoning|pensando|razonando)\.?$/i.test(final.trim())
        ? '' : final;
      actualizarUltimo({ content: contenidoFinal, _toolDraft: detectarToolDraft(contenidoFinal) || undefined,
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

      // Ejecutar TODAS las tools del turno (Gemini a veces emite 2), en orden.
      const resultados = [];
      for (const error of parsedTools.errors) {
        const visual = toolVisual({ tool: 'tool inválida', status: 'error', error, paneId: 'cloud' });
        emitirToolVisual(visual);
        agregar({ role: 'assistant', _via: 'pi-tool', _toolError: true, _toolIter: iter + 1, _toolMax: MAX_ITER,
          content: `🔧 tool inválida · iteración ${iter + 1}/${MAX_ITER}\n\n[ERROR] ${error}`, _toolVisual: visual });
        resultados.push('Tool request error: ' + error);
      }
      for (const call of calls) {
        const etiqueta = `🔧 ${call.tool} ${argsCompactos(call.args)}`;
        const visual = toolVisual({ tool: call.tool, args: call.args, status: 'running', paneId: 'cloud' });
        emitirToolVisual(visual);
        agregar({ role: 'assistant', _via: 'pi-tool', _toolIter: iter + 1, _toolMax: MAX_ITER,
          content: `${etiqueta}\n\nIteración ${iter + 1}/${MAX_ITER} · ejecutando…`, _toolVisual: visual });
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
        // Tool-vision: read de una imagen → adjuntarla al PRÓXIMO turno para que
        // la nube la VEA (no una descripción). La burbuja muestra el thumbnail.
        if (r?.is_image && r.image) {
          (adjImgs ||= []).push(r.image);
          const terminado = toolVisual({ tool: call.tool, args: call.args, status: esError ? 'error' : 'success', result: r, paneId: 'cloud' });
          emitirToolVisual(terminado);
          actualizarUltimo({ content: `${etiqueta}\n\n${salida}`, _imagen: r.image, _toolVisual: terminado });
          resultados.push(`Tool "${call.tool}" result: la imagen se adjunta abajo, míra la imagen.`);
        } else {
          // Burbuja compacta. El feedback también tiene límite: pegar 50KB en
          // ChatGPT/Gemini oculto puede consumir todo el timeout sólo armando
          // el composer. El resultado completo sigue en `r` para telemetría.
          const terminado = toolVisual({ tool: call.tool, args: call.args, status: esError ? 'error' : 'success', result: r || { ok: !esError, output: salida }, paneId: 'cloud' });
          emitirToolVisual(terminado);
          actualizarUltimo({ content: `${etiqueta}\n\n${salidaCompacta(salida)}`, _toolError: esError, _toolVisual: terminado });
          const feedback = salida.length > MAX_TOOL_FEEDBACK
            ? salida.slice(0, MAX_TOOL_FEEDBACK) + `\n…[truncado: ${salida.length - MAX_TOOL_FEEDBACK} caracteres omitidos]`
            : salida;
          resultados.push(`Tool "${call.tool}" result:\n\n${feedback}`);
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
    actualizarUltimo({ content: 'Error: ' + (err?.message || err) });
  } finally {
    cargando.value = false;
    cloudGenerando.value = false;
    // Limpiar burbuja direct-ai VACÍA que pueda quedar (re-nudge agotado, corte,
    // excepción) — se veía como un mensaje de Gemini en blanco en el chat.
    const arr = historial.value;
    const ult = arr[arr.length - 1];
    if (ult && ult.role === 'assistant' && ult._via === 'direct-ai' && !(ult.content || '').trim()) {
      historial.value = arr.slice(0, -1);
    }
  }
}
