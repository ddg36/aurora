// Duo entre los dos iframes reales de la vista Cloud. Las interfaces nativas
// permanecen visibles; un agente sólo activa al otro mediante `panel_send`.
// No hay alternancia artificial ni transcript duplicado de Aurora.

import { askCloud, detenerCloud, nuevaConversacionCloud } from '../../../components/shared/cloud-ask.js';
import { postJSON } from '../../../components/shared/api.js';
import { submitForge } from '../../../components/shared/forge-submit.js';

const MAX_ITER = 6;
const MAX_TOOL_FEEDBACK = 8 * 1024;
const TOOLS = new Set(['read', 'bash', 'edit', 'write', 'panel_send', 'forge_submit', 'view_describe', 'view_invoke']);
const PRIMER =
  'Participás en una conversación con otra IA dentro de Aurora. Tenés acceso REAL a tools de la PC. ' +
  'Cuando necesites una, emití UN objeto completo dentro de un bloque ```json y cerrá siempre el bloque. ' +
  'Formatos exactos válidos: {"tool":"read","args":{"path":"/ruta"}}; ' +
  '{"tool":"bash","args":{"cmd":"comando"}}; ' +
  '{"tool":"edit","args":{"path":"/ruta","oldText":"texto anterior","newText":"texto nuevo"}}; ' +
  '{"tool":"write","args":{"path":"/ruta","content":"contenido"}}. ' +
  'Para comunicarte con el otro agente usá {"tool":"panel_send","args":{"to":"panel1|panel2","message":"mensaje completo"}}. ' +
  'Para entregar una herramienta a Tool Forge usá {"tool":"forge_submit","args":{"manifest":{...},"code":"handler.py completo"}}; Aurora crea una versión inmutable y corre sus tests en sandbox, pero sólo el humano puede aprobarla/activarla. ' +
  'Para operar Aurora sin clics: {"tool":"view_describe","args":{"view":"scratchpad|md-reader|canvas"}} y después {"tool":"view_invoke","args":{"view":"...","action":"...","args":{...}}}. ' +
  'panel1 es el iframe izquierdo y panel2 el derecho. Sólo panel_send entrega un mensaje al otro panel; una respuesta normal termina tu participación. ' +
  'Usá un nombre real de tool, nunca una unión con | ni {...}. Preferí una tool por turno y esperá su resultado. ' +
  'No afirmes que un archivo fue creado, leído o modificado si Aurora no confirmó una ejecución exitosa.';

function extraerTools(texto = '') {
  const calls = [], errors = [];
  let from = 0;
  while (from < texto.length) {
    const rel = texto.slice(from).search(/\{\s*"tool"\s*:/);
    if (rel < 0) break;
    const ini = from + rel;
    let depth = 0, fin = -1, str = false, esc = false;
    for (let i = ini; i < texto.length; i++) {
      const ch = texto[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { str = !str; continue; }
      if (str) continue;
      if (ch === '{') depth++;
      if (ch === '}' && --depth === 0) { fin = i; break; }
    }
    if (fin < 0) { errors.push('JSON de tool incompleto'); break; }
    try {
      const call = JSON.parse(texto.slice(ini, fin + 1));
      if (!TOOLS.has(call.tool)) errors.push(`tool desconocida: ${call.tool}`);
      else calls.push({ tool: call.tool, args: call.args || {} });
    } catch (e) { errors.push('JSON de tool inválido: ' + e.message); }
    from = fin + 1;
  }
  if (!calls.length && !errors.length && /\{\s*["']?tool["']?\s*:/i.test(texto)) {
    errors.push('La tool no es JSON estricto; usá comillas dobles.');
  }
  // ChatGPT ocasionalmente corta el stream apenas en `{"`. Eso no es una
  // respuesta final válida: devolver feedback fuerza una reemisión limpia en
  // vez de entregar el fragmento como turno a la otra IA.
  if (!calls.length && !errors.length && texto.trim().startsWith('{')) {
    let balance = 0;
    for (const ch of texto) balance += ch === '{' ? 1 : ch === '}' ? -1 : 0;
    if (balance !== 0 || texto.trim().length < 8) errors.push('JSON de tool incompleto; reemití el objeto completo.');
  }
  return { calls, errors };
}

async function turnoAgente({ paneId, prompt, primed, runId, cancelado, onChunk, onTool }) {
  const panelPropio = paneId === 'izq' ? 'panel1' : 'panel2';
  const marco = `[AURORA_DUO_RUN:${runId}] Esta es una ejecución nueva y aislada. ` +
    `Vos sos ${panelPropio}. Ignorá objetivos, paths y resultados de ejecuciones Duo anteriores. ` +
    'Sólo cuenta la evidencia producida dentro de este RUN. Para hablar con el otro panel debés usar panel_send.';
  let siguiente = primed ? `${marco}\n\n${prompt}` : `${PRIMER}\n\n${marco}\n\nMensaje para vos:\n${prompt}`;
  let ultimoErrorFormato = '', repeticionesFormato = 0;
  let intentoTool = false, toolsExitosas = 0, pidioCorreccionEvidencia = false;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    if (cancelado()) throw new Error('cancelado');
    let r;
    for (let providerAttempt = 0; providerAttempt < 2; providerAttempt++) {
      r = await askCloud(null, siguiente, { paneId, onChunk, timeoutMs: 240000 });
      if (r.ok && r.text?.trim()) break;
      if (providerAttempt === 0 && ['site_empty', 'submit_failed', 'never_started'].includes(r.reason)) {
        onTool?.({ paneId, error: `Proveedor ${r.reason}; reintentando el turno una vez`, runId });
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      break;
    }
    if (!r.ok || !r.text?.trim()) throw new Error(r.text || `sin respuesta del panel ${paneId}`);
    const parsed = extraerTools(r.text);
    if (!parsed.calls.length && !parsed.errors.length) {
      // Si intentó operar la PC pero ninguna tool llegó a ejecutarse, una
      // frase como “archivo creado” no es evidencia. Dar una oportunidad de
      // corregir o reconocer el fallo antes de pasar la afirmación al otro AI.
      if (intentoTool && toolsExitosas === 0 && !pidioCorreccionEvidencia) {
        pidioCorreccionEvidencia = true;
        siguiente = 'Aurora no registró ninguna tool exitosa en este turno. No afirmes que la acción ocurrió. ' +
          'Reemití ahora un único bloque ```json completo y válido para ejecutarla, o explicá claramente que no se realizó.';
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      return { text: r.text.trim(), handoff: null };
    }

    intentoTool = true;

    const firmaError = parsed.errors.join('|');
    if (!parsed.calls.length && firmaError) {
      repeticionesFormato = firmaError === ultimoErrorFormato ? repeticionesFormato + 1 : 1;
      ultimoErrorFormato = firmaError;
      if (repeticionesFormato >= 3) {
        throw new Error(`panel ${paneId}: repitió ${repeticionesFormato} veces una tool inválida (${parsed.errors[0]})`);
      }
    } else {
      ultimoErrorFormato = '';
      repeticionesFormato = 0;
    }

    const resultados = parsed.errors.map(error => `Tool request error: ${error}`);
    for (const error of parsed.errors) onTool?.({ paneId, error, runId });
    let handoff = null;
    for (const call of parsed.calls) {
      if (cancelado()) throw new Error('cancelado');
      onTool?.({ paneId, call, status: 'running', runId });
      let result;
      if (call.tool === 'panel_send') {
        const destino = String(call.args?.to || '').toLowerCase();
        const toPane = destino === 'panel1' || destino === 'izq' ? 'izq'
          : destino === 'panel2' || destino === 'der' ? 'der' : null;
        const message = String(call.args?.message || '').trim();
        if (!toPane) result = { ok: false, is_error: true, output: 'Destino inválido. Usá panel1 o panel2.' };
        else if (toPane === paneId) result = { ok: false, is_error: true, output: `No podés enviarte un mensaje a ${panelPropio}.` };
        else if (!message) result = { ok: false, is_error: true, output: 'panel_send requiere args.message.' };
        else {
          result = { ok: true, output: `Mensaje entregado a ${toPane === 'izq' ? 'panel1' : 'panel2'}.` };
          handoff = { toPane, message, fromPane: paneId };
        }
      } else if (call.tool === 'forge_submit') {
        try { result = await submitForge(call.args); }
        catch (e) { result = { ok: false, is_error: true, output: e.message }; }
      } else if (call.tool === 'view_describe' || call.tool === 'view_invoke') {
        try {
          const response = await postJSON(`/tools/${call.tool}/run`, { arguments: call.args });
          result = { ...response, is_error: response.ok === false, output: JSON.stringify(response.result ?? response, null, 2) };
        } catch (e) { result = { ok: false, is_error: true, output: e.message }; }
      } else {
        try { result = await postJSON('/pi/cloud-tool', call); }
        catch (e) { result = { ok: false, is_error: true, output: e.message }; }
      }
      if (result?.ok && !result?.is_error) toolsExitosas++;
      const outputCompleto = result?.output || result?.error || '(sin salida)';
      const output = outputCompleto.length > MAX_TOOL_FEEDBACK
        ? outputCompleto.slice(0, MAX_TOOL_FEEDBACK) + `\n…[truncado: ${outputCompleto.length - MAX_TOOL_FEEDBACK} caracteres omitidos]`
        : outputCompleto;
      resultados.push(`Tool "${call.tool}" result${result?.is_error || !result?.ok ? ' [ERROR]' : ''}:\n${output}`);
      onTool?.({ paneId, call, result, status: result?.is_error || !result?.ok ? 'error' : 'success', runId });
    }
    // panel_send es el único puente de conversación. Entregar el control al
    // destino sin fabricar una segunda burbuja/respuesta en el panel emisor.
    if (handoff) return { text: r.text.trim(), handoff };
    if (iter === MAX_ITER - 1) throw new Error(`panel ${paneId}: límite de ${MAX_ITER} iteraciones de tools`);
    siguiente = resultados.join('\n\n---\n\n') +
      '\n\nContinuá la tarea. Si necesitás otra tool, emití JSON; si no, respondé a la otra IA.';
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

export function crearDuoCloud() {
  let detenido = false;
  const primed = new Set();

  async function iniciar(config, callbacks = {}) {
    detenido = false;
    const { onTurno, onTool, onEstado, onError } = callbacks;
    const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    let quien = config.panelInicial === 2 ? 'B' : 'A';
    let mensaje = config.seedPrompt;
    try {
      if (config.nuevaConversacion !== false) {
        onEstado?.('preparando');
        const resets = await Promise.all([
          nuevaConversacionCloud(null, 'izq'),
          nuevaConversacionCloud(null, 'der'),
        ]);
        const fallos = resets.filter(r => !r.ok);
        if (fallos.length) {
          const detalle = fallos.map(r => `${r.paneId}: ${r.error || r.reason || 'sin confirmación'}`).join('; ');
          throw new Error(`No se pudieron preparar chats nuevos (${detalle})`);
        }
        primed.clear();
      }
      if (detenido) throw new Error('cancelado');
      onEstado?.('activo');
      for (let ronda = 0; ronda < config.maxRondas && !detenido; ronda++) {
        const paneId = quien === 'A' ? 'izq' : 'der';
        let parcial = '';
        const respuesta = await turnoAgente({
          paneId, prompt: mensaje, primed: primed.has(paneId), runId, cancelado: () => detenido,
          onChunk: texto => {
            const delta = texto.startsWith(parcial) ? texto.slice(parcial.length) : texto;
            parcial = texto;
            onTurno?.({ quien, parcial: true, token: delta, texto, ronda });
          },
          onTool: ev => onTool?.({ ...ev, quien, ronda }),
        });
        primed.add(paneId);
        if (detenido) break;
        onTurno?.({ quien, texto: respuesta.text, ronda });
        if (!respuesta.handoff) break;
        const origen = respuesta.handoff.fromPane === 'izq' ? 'panel1' : 'panel2';
        quien = respuesta.handoff.toPane === 'izq' ? 'A' : 'B';
        mensaje = `[AURORA_DUO_RUN:${runId}] Mensaje recibido mediante panel_send desde ${origen}:\n\n` +
          `${respuesta.handoff.message}\n\nRespondé o trabajá con tools. Si necesitás contestarle, usá panel_send explícitamente.`;
        if (config.delayMs) await new Promise(resolve => setTimeout(resolve, config.delayMs));
      }
      onEstado?.(detenido ? 'cancelado' : 'fin');
    } catch (e) {
      if (!detenido && e.message !== 'cancelado') { onError?.(e.message); onEstado?.('error'); }
      else onEstado?.('cancelado');
    }
  }

  function detener() {
    detenido = true;
    detenerCloud(null, 'izq');
    detenerCloud(null, 'der');
  }
  return { iniciar, detener };
}
