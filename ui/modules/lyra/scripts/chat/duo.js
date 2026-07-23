// Duo Lyria ↔ Nube — el LLM local (pi) y el LLM externo (iframe cloud)
// conversan por turnos. El transcript compartido se pinta en el chat normal y
// el mismo flujo publica eventos semánticos para el escenario Avatar.
//
// Memoria: RAM-only. El transcript se pasa a pi como `history`; no toca su
// sesión persistente. La nube conserva su contexto dentro del iframe.

import { historial, cargando, cloudGenerando, agregarMensajeRico } from './mensajes.js';
import { askCloud } from '../../../../components/shared/cloud-ask.js';

const WS_URL = `ws://${location.hostname}:7779/lyra?token=${encodeURIComponent(localStorage.getItem('aurora_token') || '')}`;
const SYSTEM_DUO = 'Conversás con otra IA. Sé natural, breve y curioso. Respondé a lo que dijo el otro, no repitas.';

function abrirWS() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const to = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      reject(new Error('timeout conectando a pi'));
    }, 6000);
    ws.addEventListener('open', () => { clearTimeout(to); resolve(ws); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(to); reject(new Error('pi offline')); }, { once: true });
  });
}

function turnoPi(ws, { message, model, history, onToken }) {
  return new Promise((resolve, reject) => {
    let texto = '';
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(to);
      ws.removeEventListener('message', handler);
      fn(value);
    };
    const handler = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'token') {
        texto += msg.content || '';
        onToken?.(texto);
      } else if (msg.type === 'done') {
        finish(resolve, texto.trim());
      } else if (msg.type === 'error') {
        finish(reject, new Error(msg.message || 'error pi'));
      }
    };
    const to = setTimeout(() => finish(reject, new Error('timeout esperando turno de Lyria (60s)')), 60000);
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ type: 'chat', message, model, system: SYSTEM_DUO, history, tools: [] }));
  });
}

function actualizarMensaje(uiId, patch) {
  if (!uiId) return false;
  const arr = historial.value;
  const i = arr.findIndex(m => m._uiId === uiId);
  if (i < 0) return false;
  historial.value = [...arr.slice(0, i), { ...arr[i], ...patch, _uiId: uiId }, ...arr.slice(i + 1)];
  return true;
}

function quitarMensajeVacio(uiId) {
  if (!uiId) return false;
  const arr = historial.value;
  const msg = arr.find(m => m._uiId === uiId);
  if (!msg || msg.role !== 'assistant' || (msg.content || '').trim()) return false;
  historial.value = arr.filter(m => m._uiId !== uiId);
  return true;
}

export function crearDuoLyraCloud() {
  let cancelado = false;
  let ws = null;

  async function iniciar({
    iframe,
    model = '',
    maxRondas = 8,
    empieza = 'local',
    convId = null,
    seed = 'Presentate en una frase y proponé un tema interesante para charlar.',
  }, callbacks = {}) {
    const { onEstado, onError, onTurn } = callbacks;
    let fallo = null;
    const emitirTurno = (speaker, phase, text, round, error = null) => onTurn?.({
      speaker,
      phase,
      text: text || '',
      round,
      error,
      ts: Date.now(),
    });

    cancelado = false;
    onEstado?.('conectando');
    try {
      ws = await abrirWS();
    } catch (e) {
      onError?.(e.message);
      onEstado?.('error');
      return;
    }

    const histPi = [];
    let quien = empieza;
    let mensaje = seed;
    onEstado?.('activo');

    for (let ronda = 0; ronda < maxRondas && !cancelado; ronda++) {
      if (quien === 'local') {
        const placeholder = agregarMensajeRico({ role: 'assistant', content: '', _via: 'duo-local' });
        const uiId = placeholder?._uiId;
        let resp;
        emitirTurno('local', 'start', '', ronda);
        try {
          resp = await turnoPi(ws, {
            message: mensaje,
            model,
            history: [...histPi],
            onToken: text => {
              actualizarMensaje(uiId, { content: text });
              emitirTurno('local', 'stream', text, ronda);
            },
          });
        } catch (e) {
          quitarMensajeVacio(uiId);
          fallo = e;
          emitirTurno('local', 'error', '', ronda, e.message);
          onError?.(e.message);
          break;
        }
        if (cancelado) break;
        actualizarMensaje(uiId, { content: resp });
        emitirTurno('local', 'done', resp, ronda);
        histPi.push({ role: 'user', content: mensaje });
        histPi.push({ role: 'assistant', content: resp });
        mensaje = resp;
        quien = 'cloud';
      } else {
        const placeholder = agregarMensajeRico({ role: 'assistant', content: '', _via: 'duo-external', _convId: convId });
        const uiId = placeholder?._uiId;
        let resp;
        emitirTurno('cloud', 'start', '', ronda);
        cloudGenerando.value = true;
        try {
          const r = await askCloud(iframe, mensaje, {
            onChunk: text => {
              actualizarMensaje(uiId, { content: text });
              emitirTurno('cloud', 'stream', text, ronda);
            },
          });
          if (!r.ok) throw new Error(r.text || 'sin respuesta de la nube');
          resp = r.text || '(sin respuesta de la nube)';
        } catch (e) {
          quitarMensajeVacio(uiId);
          fallo = e;
          emitirTurno('cloud', 'error', '', ronda, e.message);
          onError?.(e.message);
          break;
        } finally {
          cloudGenerando.value = false;
        }
        if (cancelado) break;
        actualizarMensaje(uiId, { content: resp });
        emitirTurno('cloud', 'done', resp, ronda);
        mensaje = resp;
        quien = 'local';
      }
    }

    const fueCancelado = cancelado;
    detener();
    onEstado?.(fueCancelado ? 'cancelado' : fallo ? 'error' : 'fin');
  }

  function detener() {
    cancelado = true;
    try { ws?.close(); } catch (_) {}
    ws = null;
    cargando.value = false;
    cloudGenerando.value = false;
  }

  return { iniciar, detener };
}
