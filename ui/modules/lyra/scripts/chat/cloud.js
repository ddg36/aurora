// Envío al Cloud Backend (LLM externo en iframe) desde el chat de Lyra.
// La respuesta aparece en el mismo hilo pero marcada _via:'direct-ai' (visual
// distinto) y NUNCA toca a pi: no llama sendToLyra ni guarda en la tabla
// `mensajes` (contexto de pi). Su memoria vive aparte en cloud_mensajes.
//
// Tools: el LLM de la nube puede pedir las factories REALES de pi mediante
// JSON Family. El Pi Tool Provider las ejecuta directamente, sin RPC,
// AgentSession ni segundo LLM, y el resultado vuelve al origen.

import { historial, cargando, cloudGenerando, agregarMensajeRico } from './mensajes.js';
import { askCloud, confirmarCloudAnswer } from '../../../../components/shared/cloud-ask.js';
import { postJSON, getJSON, putJSON } from '../../../../components/shared/api.js';
import { detectarToolDraft, toolVisual, emitirToolVisual } from '../../../../components/shared/cloud-tool-visual.js';
import { getCloudToolPrimer } from '../../../../components/shared/cloud-tool-primer.js';
import { processJSONFamily } from '../../../../components/shared/json-family-client.js';
import { jsonFamilyEnabled, initJSONFamilyState } from '../../../../components/shared/json-family-state.js';

const MAX_ITER = 100;
// Las tools oficiales de pi ya limitan la salida a 50KB. Feedback casi hasta ese
// tope: truncar antes dejaba a la nube sin ver el resultado real (bash/read
// grandes se cortaban a 8KB → la AI trabajaba a ciegas).
const MAX_TOOL_FEEDBACK = 48 * 1024;

function activeCloudProtocol() {
  return jsonFamilyEnabled.value ? 'json-family' : null;
}

async function processCloudToolProtocol(text, { requestId, origin, clientTools = [] } = {}) {
  if (jsonFamilyEnabled.value) {
    return processJSONFamily(text, {
      requestId,
      origin: { ...origin, protocol: 'json-family' },
      clientTools,
    });
  }
  return { kind: 'disabled', parsed: { calls: [], errors: [] }, entries: [] };
}

function parsedProtocolResult(result) {
  return result?.parsed || { calls: [], errors: [] };
}

// Prime UNA sola vez por HILO de la nube. Antes vivía en sessionStorage, que se
// borra en cada reload/reinicio de Aurora: al reabrir Aurora y seguir el MISMO
// hilo de ChatGPT, el flag estaba vacío y se re-inyectaba el primer en medio de
// la conversación (repetía el prompt de inicio). Ahora es durable: DB (ajuste,
// autoridad + cross-surface) + espejo en localStorage (lectura sync que
// sobrevive el reload) + Set en memoria. El hilo persiste server-side; su marca
// de cebado también debe persistir.
const PRIMED_LS = 'aurora_cloud_primed_v1';
const PRIMED_CLAVE = 'cloud_primed_threads_v1';
const _primedThreads = new Set();
try {
  const raw = localStorage.getItem(PRIMED_LS);
  if (raw) JSON.parse(raw).forEach(k => _primedThreads.add(k));
} catch (_) {}
getJSON(`/db/ajustes/${PRIMED_CLAVE}`)
  .then(r => { try { (JSON.parse(r?.valor || '[]') || []).forEach(k => _primedThreads.add(k)); } catch (_) {} })
  .catch(() => {});

function yaCebado(convKey) {
  return !!convKey && _primedThreads.has(convKey);
}
function marcarCebado(convKey) {
  if (!convKey || _primedThreads.has(convKey)) return;
  _primedThreads.add(convKey);
  const arr = [..._primedThreads].slice(-200);   // acotar: hilos viejos caen
  try { localStorage.setItem(PRIMED_LS, JSON.stringify(arr)); } catch (_) {}
  putJSON(`/db/ajustes/${PRIMED_CLAVE}`, { valor: JSON.stringify(arr) }).catch(() => {});
}

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

// Resultado canónico devuelto dentro de una entry de JSON Family.
function textoResultadoFamily(r) {
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
  const r = await postJSON('/cloud-agent/turn/save', {
    turnId,
    paneId: 'cloud',
    ...data,
  });
  if (!r?.ok) throw new Error(r?.error || 'No se pudo guardar el journal Cloud.');
  return r;
}

async function completarTurnoCloud(turnId, status = 'completed') {
  try {
    return await postJSON('/cloud-agent/turn/complete', { turnId, status });
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
  const r = await postJSON('/cloud-agent/turn/recover', { paneId: 'cloud' });
  const turn = normalizarTurnoCloud(r?.turn);
  if (!turn) return { resumed: false, reason: 'none' };

  await enviarACloud({
    iframe,
    texto: turn.prompt || turn.nextPrompt || '',
    aiId: turn.aiId,
    url: turn.url,
    resume: { turn },
  });
  return { resumed: true, turnId: turn.turnId, aiId: turn.aiId, url: turn.url };
}

export async function enviarACloud({ iframe, texto, aiId, url, images, files, resume = null }) {
  await initJSONFamilyState();
  const turnoPrevio = normalizarTurnoCloud(resume?.turn);
  const retomando = !!turnoPrevio;
  const turnId = turnoPrevio?.turnId || nuevoTurnId();

  cargando.value = true;
  cloudGenerando.value = true;

  const convId = turnoPrevio?.convId ?? await asegurarConversacion(aiId, url);
  aiId = turnoPrevio?.aiId || aiId;
  url = turnoPrevio?.url || url;
  // El vigía de cambio de hilo (relay-core.js → AURORA_CLOUD_NAV_CHANGED)
  // puede resolver "sin memoria" (convId null) ANTES de que este turno cree
  // la conversación en DB — sin este aviso, el filtro de historial de
  // lyra.js queda con cloudConvIdActivo desactualizado y oculta la propia
  // respuesta que se acaba de generar. Autoritativo: este turno SABE el
  // convId real que está usando ahora mismo.
  if (convId) window.dispatchEvent(new CustomEvent('aurora:cloud-conv-resolved', { detail: { url, convId } }));

  if (!retomando) {
    agregar({
      role: 'user',
      content: texto,
      _imagenes: images?.length ? images : undefined,
      _adjuntos: (files?.length || 0) || undefined,
      _convId: convId,
    });
  }

  // Primer sólo en turnos nuevos. En recuperación se usa el prompt exacto que
  // quedó persistido, incluido el cebado si correspondía.
  let prompt;
  if (retomando) {
    prompt = turnoPrevio.status === 'feedback_ready'
      ? (turnoPrevio.nextPrompt || turnoPrevio.prompt || texto)
      : (turnoPrevio.prompt || texto);
  } else {
    // Cebar por HILO de ChatGPT, no por host. Antes la key era el host
    // (chatgpt.com): tras un chat nuevo el flag seguía puesto y el hilo fresco
    // NO recibía el primer → ChatGPT no sabía que tenía tools y alucinaba la
    // ejecución (o razonaba sin emitir el bloque JSON). El id de hilo vive en
    // la url (/c/<id>). Sin id todavía (chat recién abierto, url base) es un
    // hilo fresco → cebar siempre. Repetir el primer es ruido; omitirlo rompe.
    const convKey = (() => {
      try {
        const u = new URL(url);
        const m = u.pathname.match(/\/(?:c|g|share)\/([\w-]+)/);
        return m ? `${u.host}:${m[1]}` : null;
      } catch { return null; }
    })();
    const protocol = activeCloudProtocol();
    const primedKey = protocol && convKey ? convKey : null;
    let primer = '';
    if (protocol && !yaCebado(primedKey)) primer = await getCloudToolPrimer();
    prompt = primer ? `${primer}\n\n${texto}` : texto;
    if (primedKey) marcarCebado(primedKey);
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
        _toolIter: iter + 1, _toolMax: MAX_ITER, _convId: convId,
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

      const familyResult = await processCloudToolProtocol(final, {
        requestId: `lyra-cloud-${turnId}-${iter}`,
        origin: { relay: 'lyra-cloud', surface: 'iframe', provider: aiId || 'cloud' },
      });
      const parsedTools = parsedProtocolResult(familyResult);
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
            _toolVisual: visual, _convId: convId,
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
          _toolVisual: visual, _convId: convId,
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
          _toolVisual: visual, _convId: convId,
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
          const entry = (familyResult.entries || []).filter(item => item.kind === 'tool_result')[indice];
          r = entry?.result || { ok: false, is_error: true, output: 'El orquestador activo no devolvió el resultado de esta tool.' };
          salida = textoResultadoFamily(r);
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

      const continuation = 'Continue from these real results. Need another tool? Send one final visible ```json block, never hidden reasoning. Otherwise answer normally.';
      prompt = resultados.join('\n\n---\n\n') + `\n\n${continuation}`;

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
          _toolVisual: visual, _convId: convId,
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
