// Duo entre los dos iframes reales de la vista Cloud. Las interfaces nativas
// permanecen visibles; un agente sólo activa al otro mediante `panel_send`.
// No hay alternancia artificial ni transcript duplicado de Aurora.

import { askCloud, detenerCloud, nuevaConversacionCloud } from '../../../components/shared/cloud-ask.js';
import { processJSONFamily } from '../../../components/shared/json-family-client.js';
import { getCloudToolPrimer } from '../../../components/shared/cloud-tool-primer.js';
import { jsonFamilyEnabled, initJSONFamilyState } from '../../../components/shared/json-family-state.js';

const MAX_ITER = 100;
const MAX_TOOL_FEEDBACK = 8 * 1024;

async function turnoAgente({ paneId, prompt, primed, runId, cancelado, onChunk, onTool }) {
  await initJSONFamilyState();
  const panelPropio = paneId === 'izq' ? 'panel1' : 'panel2';
  const marco = `[AURORA_DUO_RUN:${runId}] Esta es una ejecución nueva y aislada. ` +
    `Vos sos ${panelPropio}. Ignorá objetivos, paths y resultados de ejecuciones Duo anteriores. ` +
    'Sólo cuenta la evidencia producida dentro de este RUN. Para hablar con el otro panel debés usar panel_send.';
  const primer = (primed || !jsonFamilyEnabled.value) ? '' : await getCloudToolPrimer({ collaboration: true });
  let siguiente = primer ? `${primer}\n\n${marco}\n\nMensaje para vos:\n${prompt}` : `${marco}\n\n${prompt}`;
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
    const familyResult = jsonFamilyEnabled.value
      ? await processJSONFamily(r.text, {
          requestId: `duo-${runId}-${paneId}-${iter}`,
          origin: { relay: 'cloud-duo', surface: 'iframe', provider: paneId },
          clientTools: ['panel_send'],
        })
      : { parsed: { calls: [], errors: [] }, entries: [] };
    const parsed = familyResult.parsed || { calls: [], errors: [] };
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
      } else {
        const entry = (familyResult.entries || []).find(item =>
          item.kind === 'tool_result' && item.call?.tool === call.tool &&
          JSON.stringify(item.call?.args || {}) === JSON.stringify(call.args || {}));
        result = entry?.result || { ok: false, is_error: true, output: 'JSON Family no devolvió el resultado.' };
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
