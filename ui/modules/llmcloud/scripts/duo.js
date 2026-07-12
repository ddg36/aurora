const BASE_WS = `ws://${location.hostname}:7779/lyra`;

function abrirSesion() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE_WS);
    const to = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('timeout conectando a lyra')); }, 6000);
    ws.addEventListener('open', () => { clearTimeout(to); resolve(ws); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(to); reject(new Error('lyra offline')); }, { once: true });
  });
}

function turno(ws, { message, model, system, history, onToken }) {
  return new Promise((resolve, reject) => {
    let texto = '';
    const handler = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case 'token':
          texto += msg.content || '';
          onToken?.(msg.content || '');
          break;
        case 'done':
          ws.removeEventListener('message', handler);
          resolve(texto.trim());
          break;
        case 'error':
          ws.removeEventListener('message', handler);
          reject(new Error(msg.message || 'error en turno'));
          break;
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ type: 'chat', message, model, system, history, tools: [] }));
  });
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const SYSTEM_POR_MODO = {
  libre:          'Conversás con otra IA. Sé natural, breve y curioso. No repitas lo ya dicho.',
  debate:         'Debatís con otra IA. Defendé tu posición con argumentos firmes pero respetuosos. Respondé a los puntos del otro.',
  colaboracion:   'Colaborás con otra IA para construir una idea juntos. Aportá, expandí y conectá con lo que dijo el otro.',
  interrogatorio: 'Interrogatorio entre IAs. Si te toca preguntar, hacé preguntas profundas. Si te toca responder, respondé con detalle.',
};

export function crearDuo() {
  let cancelado = false;
  let wsA = null;
  let wsB = null;

  async function iniciar(config, callbacks) {
    const {
      modo = 'libre',
      seedPrompt = 'Saludá a la otra IA y proponé un tema interesante. Sé breve.',
      maxRondas = 10,
      delayMs = 0,
      panelInicial = 1,
      modelA = '',
      modelB = '',
    } = config;
    const { onTurno, onEstado, onError } = callbacks || {};
    const system = SYSTEM_POR_MODO[modo] || SYSTEM_POR_MODO.libre;

    cancelado = false;
    onEstado?.('conectando');
    try {
      [wsA, wsB] = await Promise.all([abrirSesion(), abrirSesion()]);
    } catch (e) {
      onError?.(e.message);
      onEstado?.('error');
      return;
    }

    const histA = [];
    const histB = [];
    let quien = panelInicial === 2 ? 'B' : 'A';
    let mensaje = seedPrompt;

    onEstado?.('activo');
    for (let ronda = 0; ronda < maxRondas && !cancelado; ronda++) {
      const esA = quien === 'A';
      const ws = esA ? wsA : wsB;
      const model = esA ? modelA : modelB;
      const history = esA ? histA : histB;

      let respuesta;
      try {
        respuesta = await turno(ws, {
          message: mensaje, model, system, history,
          onToken: t => onTurno?.({ quien, parcial: true, token: t, ronda }),
        });
      } catch (e) {
        onError?.(e.message);
        break;
      }
      if (cancelado) break;

      onTurno?.({ quien, texto: respuesta, ronda });
      histA.push(esA ? { role: 'assistant', content: respuesta } : { role: 'user', content: respuesta });
      histB.push(esA ? { role: 'user', content: respuesta } : { role: 'assistant', content: respuesta });

      mensaje = respuesta;
      quien = esA ? 'B' : 'A';
      if (delayMs > 0 && !cancelado) await delay(delayMs);
    }

    const fueCancelado = cancelado;
    detener();
    onEstado?.(fueCancelado ? 'cancelado' : 'fin');
  }

  function detener() {
    cancelado = true;
    try { wsA?.close(); } catch {}
    try { wsB?.close(); } catch {}
    wsA = null;
    wsB = null;
  }

  return { iniciar, detener };
}
