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

// Tools reales del harness de pi (verificado). Solo estas se aceptan.
const TOOLS_PI = {
  read:  'Leé un archivo. args: {"path": "ruta"}',
  bash:  'Corré un comando de shell. args: {"cmd": "comando"}',
  edit:  'Editá un archivo por reemplazo exacto. args: {"path","oldText","newText"}',
  write: 'Escribí/creá un archivo. args: {"path","content"}',
};

// Reconocedor: busca el objeto JSON {"tool":...,"args":...} en la respuesta,
// venga en bloque de código o suelto. NO depende del lenguaje del fence (los
// LLMs no preservan lenguajes custom como "pitool" al renderizar). Extractor
// de llaves balanceadas desde `{"tool"` — robusto a JSON anidado (args).
function parsearToolCall(texto) {
  const idx = texto.search(/\{\s*"tool"\s*:/);
  if (idx < 0) return null;
  let depth = 0, fin = -1;
  for (let i = idx; i < texto.length; i++) {
    const ch = texto[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { fin = i; break; } }
  }
  if (fin < 0) return null;
  let obj;
  try { obj = JSON.parse(texto.slice(idx, fin + 1)); } catch { return null; }
  if (!obj || typeof obj.tool !== 'string' || !(obj.tool in TOOLS_PI)) return null;
  return { tool: obj.tool, args: obj.args || {} };
}

const MAX_ITER = 6;

const PRIMER =
  'Tenés acceso a la PC del usuario con herramientas reales. Para usar una, incluí en tu ' +
  'respuesta un objeto JSON: {"tool":"NOMBRE","args":{...}}. Tools: ' +
  Object.entries(TOOLS_PI).map(([n, d]) => `${n} (${d.split(' args:')[0]})`).join('; ') +
  '. Reglas: UNA tool por vez; SOLO cuando necesites datos reales de la PC. El resultado ' +
  'llega como mensaje nuevo. Si una tool falla, leé el archivo de nuevo y reintentá con el texto exacto.';

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
function throttleContenido() {
  const INTERVALO = 120;
  let pendiente = null, timer = null, ultimo = 0;
  const aplicar = () => { if (pendiente != null) actualizarUltimo({ content: pendiente }); pendiente = null; ultimo = Date.now(); timer = null; };
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

export async function enviarACloud({ iframe, texto, aiId, url }) {
  agregar({ role: 'user', content: texto });

  cargando.value = true;
  cloudGenerando.value = true;
  const convId = await asegurarConversacion(aiId, url);
  await persistir(convId, 'user', texto);

  // Primer una sola vez por host de la nube (no repetir a cada rato).
  const convKey = (() => { try { return new URL(url).host; } catch { return aiId || 'cloud'; } })();
  let prompt = yaCebado(convKey) ? texto : `${PRIMER}\n\n${texto}`;
  marcarCebado(convKey);

  try {
    for (let iter = 0; iter < MAX_ITER; iter++) {
      agregar({ role: 'assistant', content: '', _via: 'direct-ai' });
      const t0 = Date.now();
      const thr = throttleContenido();
      // Re-query FRESCO cada iteración: la referencia capturada al inicio queda
      // stale si la app re-renderiza el iframe entre turnos (contentWindow
      // muerto → el ASK no llega → askCloud cuelga). Este era el bug del loop.
      const fr = document.querySelector('iframe[data-pane="cloud"]') || iframe;
      const res = await askCloud(fr, prompt, { onChunk: (p) => thr.push(p) });
      thr.flush();
      const final = res.text || '(sin respuesta detectada)';
      actualizarUltimo({ content: final, _timing: { responde: res.respondeMs, genera: res.generaMs, rt: Date.now() - t0 } });
      await persistir(convId, 'assistant', final);

      const call = parsearToolCall(final);
      if (!call) break;   // sin tool-call válido: turno terminado

      agregar({ role: 'assistant', _via: 'pi-tool', content: `🔧 ${call.tool} ${JSON.stringify(call.args)}` });
      let salida;
      try {
        const r = await postJSON('/pi/cloud-tool', { tool: call.tool, args: call.args });
        salida = formatearResultado(r);
      } catch (err) {
        salida = 'Error llamando a pi: ' + (err?.message || err);
      }
      actualizarUltimo({ content: `🔧 ${call.tool} ${JSON.stringify(call.args)}\n\n${salida}` });
      // Feedback: pedir explícitamente que continúe (un `[Resultado]` seco a
      // veces daba respuesta vacía — Gemini no sabía que debía seguir).
      prompt = `Tool "${call.tool}" result:\n\n${salida}\n\nContinue with the task using this result. If you need another tool, emit its JSON; otherwise give your final answer.`;
      // Settle: la tool es instantánea; Gemini necesita un momento tras su
      // respuesta previa antes de aceptar el próximo mensaje.
      await new Promise(r => setTimeout(r, 1200));
    }
  } catch (err) {
    actualizarUltimo({ content: 'Error: ' + (err?.message || err) });
  } finally {
    cargando.value = false;
    cloudGenerando.value = false;
  }
}
