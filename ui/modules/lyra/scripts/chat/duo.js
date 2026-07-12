// Duo Lyra ↔ Nube — el LLM local (pi) y el LLM externo (iframe cloud)
// conversan por turnos, alternando. Cada turno se pinta en el hilo de Lyra
// con su marca visual: local = 🦙 Lyra, nube = ◇ AI (via 'duo-external').
//
// Memoria: RAM-only. El transcript compartido se le pasa a pi como `history`
// por turno (no toca su sesión persistente); la nube arrastra su contexto en
// el propio iframe. NADA se guarda en la tabla `mensajes` de pi.
// ponytail: sin persistencia del duo — es efímero por diseño; si se quiere
// guardar la charla, va a cloud_mensajes con un flag 'duo'.

import { historial, cargando, cloudGenerando } from './mensajes.js';
import { askCloud } from '../../../../components/shared/cloud-ask.js';

const WS_URL = `ws://${location.hostname}:7779/lyra?token=${encodeURIComponent(localStorage.getItem('aurora_token') || '')}`;

const SYSTEM_DUO = 'Conversás con otra IA. Sé natural, breve y curioso. Respondé a lo que dijo el otro, no repitas.';

function abrirWS() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const to = setTimeout(() => { try { ws.close(); } catch (_) {} reject(new Error('timeout conectando a pi')); }, 6000);
    ws.addEventListener('open', () => { clearTimeout(to); resolve(ws); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(to); reject(new Error('pi offline')); }, { once: true });
  });
}

function turnoPi(ws, { message, model, history, onToken }) {
  return new Promise((resolve, reject) => {
    let texto = '';
    const handler = ev => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'token') { texto += msg.content || ''; onToken?.(texto); }
      else if (msg.type === 'done') { ws.removeEventListener('message', handler); resolve(texto.trim()); }
      else if (msg.type === 'error') { ws.removeEventListener('message', handler); reject(new Error(msg.message || 'error pi')); }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ type: 'chat', message, model, system: SYSTEM_DUO, history, tools: [] }));
  });
}

// Reemplaza el último mensaje del historial (placeholder en vivo del turno).
function actualizarUltimo(patch) {
  const arr = historial.value;
  if (!arr.length) return;
  historial.value = [...arr.slice(0, -1), { ...arr[arr.length - 1], ...patch }];
}

export function crearDuoLyraCloud() {
  let cancelado = false;
  let ws = null;

  async function iniciar({ iframe, model = '', maxRondas = 8, empieza = 'local',
                           seed = 'Presentate en una frase y proponé un tema interesante para charlar.' },
                         callbacks = {}) {
    const { onEstado, onError } = callbacks;
    cancelado = false;
    onEstado?.('conectando');
    try { ws = await abrirWS(); } catch (e) { onError?.(e.message); onEstado?.('error'); return; }

    const histPi = [];   // desde la óptica de pi: sus turnos 'assistant', la nube 'user'
    let quien = empieza; // 'local' | 'cloud'
    let mensaje = seed;
    onEstado?.('activo');

    for (let ronda = 0; ronda < maxRondas && !cancelado; ronda++) {
      if (quien === 'local') {
        historial.value = [...historial.value, { role: 'assistant', content: '', ts: Date.now() }];
        let resp;
        try {
          resp = await turnoPi(ws, { message: mensaje, model, history: [...histPi], onToken: t => actualizarUltimo({ content: t }) });
        } catch (e) { onError?.(e.message); break; }
        if (cancelado) break;
        actualizarUltimo({ content: resp });
        histPi.push({ role: 'user', content: mensaje });
        histPi.push({ role: 'assistant', content: resp });
        mensaje = resp;
        quien = 'cloud';
      } else {
        historial.value = [...historial.value, { role: 'assistant', content: '', _via: 'duo-external', ts: Date.now() }];
        let resp;
        cloudGenerando.value = true;
        try {
          const r = await askCloud(iframe, mensaje, { onChunk: t => actualizarUltimo({ content: t }) });
          resp = r.text || '(sin respuesta de la nube)';
        } catch (e) { onError?.(e.message); break; }
        finally { cloudGenerando.value = false; }
        if (cancelado) break;
        actualizarUltimo({ content: resp });
        mensaje = resp;
        quien = 'local';
      }
    }

    const fue = cancelado;
    detener();
    onEstado?.(fue ? 'cancelado' : 'fin');
  }

  function detener() {
    cancelado = true;
    try { ws?.close(); } catch (_) {}
    ws = null;
    cargando.value = false;
  }

  return { iniciar, detener };
}
