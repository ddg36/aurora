// cloud-relay.js — corre DENTRO del iframe del LLM cloud (all_frames).
// Puente Lyra ↔ AI: recibe AURORA_CLOUD_ASK del padre (la UI de Aurora),
// inyecta el prompt, envía, y detecta la respuesta del asistente leyendo el
// DOM. Devuelve AURORA_CLOUD_CHUNK (streaming) y AURORA_CLOUD_ANSWER (final).
//
// Port fiel de los mods legacy de AI-Hub (detectar-input + inyectar +
// orquestador-estados + bridge). Protocolo renombrado GEMITA_ → AURORA_CLOUD_.
// Solo reporta desde el frame montado por Aurora (mismo gate que el sniffer).
(() => {
  if (window.top === window) return;
  const padre = location.ancestorOrigins?.[0] || '';
  if (!/^chrome-extension:|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(padre)) return;

  // ── detectar input / botón enviar ──────────────────────
  const INPUT_SELECTORS = [
    '#prompt-textarea',
    'div[contenteditable="true"].ql-editor',
    'div[contenteditable="true"][aria-label]',
    'div[contenteditable="true"][data-testid]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'textarea[placeholder]',
    'textarea[aria-label*="chat" i]',
    'textarea[aria-label*="message" i]',
    'rich-textarea',
  ];
  const SEND_SELECTORS = [
    'button[data-testid="send-button"]',
    'button[aria-label*="Send" i]',
    'button[aria-label*="Enviar" i]',
    'form button[type="submit"]',
    'button[title*="send" i]',
  ];
  // Contenedores de UN turno del asistente (uno por respuesta). Contamos
  // estos para enganchar al nuevo; el texto sale del .markdown/.prose interno.
  const CONTAINER_SELECTORS = [
    'model-response',                                // Gemini
    '[data-message-author-role="assistant"]',        // ChatGPT
    '[data-testid="conversation-turn-assistant"]',   // ChatGPT alt
    '.font-claude-message',                          // Claude
    'message-content',                              // genérico
  ];
  // Nodos que pueden tener el texto de la respuesta. CLAVE: mientras Gemini
  // GENERA, el texto en vivo vive en `.pending` (o similar) y `.markdown`
  // queda vacío; al terminar lo mueve a `.markdown`. Por eso leemos el nodo
  // con MÁS texto entre estos — así capturamos el stream en tiempo real y el
  // final, sin arrastrar labels de accesibilidad del wrapper externo.
  // SOLO nodos ajustados de contenido: .markdown (final), .pending (stream),
  // .prose (Claude/ChatGPT). Los wrappers (.model-response-text,
  // .message-content) incluyen labels de accesibilidad tipo "Gemini dijo" y
  // ganaban el max-text → arrastraban el prefijo. Excluidos a propósito.
  const TEXTO_SELS = ['.markdown', '.pending', '.prose'];
  // Señal de "terminó" propia del sitio (mucho más fiable que heurística):
  // Gemini marca .response-footer.complete al cerrar el turno.
  const COMPLETO_SELECTORS = '.response-footer.complete, footer.complete, [class*="footer"].complete';
  const STOP_SELECTORS = [
    'button[aria-label*="Stop" i]',
    'button[aria-label*="Detener" i]',
    'button[data-testid*="stop" i]',
    '.animate-pulse', '.loading-indicator', '.loading-dot',
  ];

  const getInput = () => INPUT_SELECTORS.map(s => document.querySelector(s)).find(Boolean) || null;
  const getSend  = () => SEND_SELECTORS.map(s => document.querySelector(s)).find(b => b && b.offsetParent !== null) || null;
  const getStop  = () => STOP_SELECTORS.map(s => document.querySelector(s)).find(b => b && b.offsetParent !== null) || null;

  function injectText(el, text) {
    el.focus();
    if (el.getAttribute('contenteditable') === 'true') {
      document.execCommand('selectAll', false, null);
      const ok = document.execCommand('insertText', false, text);
      if (!ok || !el.innerText?.trim()) {
        el.innerText = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      try { setter ? setter.call(el, text) : (el.value = text); } catch { el.value = text; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function submit(el) {
    const btn = getSend();
    if (btn && !btn.disabled) { btn.click(); return; }
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true, composed: true,
    }));
  }

  // ── DOM → markdown (port fiel del orquestador legacy) ───
  function domToMarkdown(root) {
    if (!root) return '';
    const out = [];
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) { out.push(node.textContent); return; }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (tag === 'button' || tag === 'script' || tag === 'style' || node.getAttribute('aria-hidden') === 'true') return;
      if (tag === 'pre') {
        const code = node.querySelector('code'); const target = code || node;
        const m = (target.className || '').match(/language-([\w+#-]+)/i);
        const txt = (target.innerText || target.textContent || '').replace(/\n+$/, '');
        out.push('\n\n```' + (m ? m[1] : '') + '\n' + txt + '\n```\n\n'); return;
      }
      if (tag === 'code') { out.push('`' + (node.innerText || node.textContent || '') + '`'); return; }
      const h = { h1: '\n\n# ', h2: '\n\n## ', h3: '\n\n### ', h4: '\n\n#### ', h5: '\n\n##### ', h6: '\n\n###### ' }[tag];
      if (h) { out.push(h); node.childNodes.forEach(walk); out.push('\n\n'); return; }
      if (tag === 'p' || tag === 'div') { node.childNodes.forEach(walk); out.push('\n\n'); return; }
      if (tag === 'br') { out.push('\n'); return; }
      if (tag === 'hr') { out.push('\n\n---\n\n'); return; }
      if (tag === 'strong' || tag === 'b') { out.push('**'); node.childNodes.forEach(walk); out.push('**'); return; }
      if (tag === 'em' || tag === 'i') { out.push('*'); node.childNodes.forEach(walk); out.push('*'); return; }
      if (tag === 'a') { out.push('['); node.childNodes.forEach(walk); out.push('](' + (node.getAttribute('href') || '') + ')'); return; }
      if (tag === 'ul' || tag === 'ol') {
        out.push('\n'); const ordered = tag === 'ol'; let i = 1;
        for (const li of node.children) {
          if (li.tagName?.toLowerCase() !== 'li') continue;
          out.push(ordered ? `${i}. ` : '- '); li.childNodes.forEach(walk); out.push('\n'); i++;
        }
        out.push('\n'); return;
      }
      node.childNodes.forEach(walk);
    }
    walk(root);
    return out.join('').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  }

  // Contenedores de turno (del primer selector que matchee). Contar-y-enganchar
  // al NUEVO es robusto: el mensaje anterior ya está en el DOM y confundía.
  function contenedores() {
    for (const sel of CONTAINER_SELECTORS) {
      const els = document.querySelectorAll(sel);
      if (els.length) return [...els];
    }
    return [];
  }
  // El nodo con MÁS texto entre los candidatos (durante el stream gana
  // `.pending`, al final `.markdown`). Si ninguno matchea, el contenedor.
  const nodoTexto = c => {
    let best = null, bl = -1;
    for (const s of TEXTO_SELS) {
      for (const n of c.querySelectorAll(s)) {
        const t = (n.innerText || '').length;
        if (t > bl) { bl = t; best = n; }
      }
    }
    return best || c;
  };
  const textOf = c => (nodoTexto(c)?.innerText || '').trim();
  const estaCompleto = c => !!c.querySelector(COMPLETO_SELECTORS);
  const norm = t => (t || '').replace(/\s+/g, ' ').trim();
  const generando = () => {
    if (getStop()) return true;
    return [...document.querySelectorAll('mat-progress-spinner, .loading-dot, .pulse-indicator')].some(e => e.offsetParent !== null);
  };

  // Fase 1: esperar a que aparezca el contenedor NUEVO (count sube), o que el
  // último cambie de contenido si el sitio REUSA el nodo (raro). NO usar
  // generando() acá: al enviar, el botón "Detener" aparece al instante y
  // haría enganchar el mensaje VIEJO (el nuevo turno tarda ~4.5s en existir).
  // Ese era el bug de "captura el anterior".
  async function esperarTarget(base, deadline) {
    while (Date.now() < deadline) {
      const cs = contenedores();
      if (cs.length > base.count) return cs[cs.length - 1];
      if (cs.length === base.count && base.count > 0) {
        const cur = cs[cs.length - 1];
        // Solo si el texto REALMENTE cambió (nodo reusado y vaciado/reescrito).
        if (norm(textOf(cur)) !== base.lastText) return cur;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  }

  // Head-start ÚNICO al inicio: esperamos INICIO_DELAY ms tras enviar antes de
  // empezar a copiar. En ese lapso el LLM ya generó algo de texto, así no
  // arrancamos leyendo vacío ni un token a medio pintar. La captura queda
  // corrida ~INICIO_DELAY respecto a la generación (gen 5s → captura ~5.75s).
  const INICIO_DELAY = 300;

  // Fase 2: seguir el target con MutationObserver → streaming en tiempo real.
  // Timers: respondeMs (primer texto capturado - submit) y generaMs (última
  // captura - submit ≈ generación + head-start).
  function seguirTarget(target, { onChunk, cancelToken, timeoutMs, submitAt }) {
    return new Promise(resolve => {
      const start = Date.now();
      let lastText = '', lastMd = '', lastChange = Date.now();
      let settle = null, hecho = false, capturando = false;
      let respondeMs = null, ultimaCaptura = submitAt;

      const leer = () => {
        if (!capturando) return;   // todavía en el head-start
        const t = norm(textOf(target));
        if (t === lastText) return;
        lastText = t; lastChange = Date.now(); ultimaCaptura = Date.now();
        if (respondeMs === null && t) respondeMs = Date.now() - submitAt;
        const md = domToMarkdown(nodoTexto(target));
        if (md) lastMd = md;
        onChunk?.(lastMd || lastText);
      };

      const terminar = (reason) => {
        if (hecho) return; hecho = true;
        obs.disconnect(); clearInterval(poll); clearTimeout(settle); clearTimeout(arranque);
        capturando = true; leer();   // lectura final
        resolve({
          ok: !!lastText,
          text: lastMd || lastText || '(sin respuesta detectada)',
          reason,
          respondeMs: respondeMs ?? (Date.now() - submitAt),
          generaMs: ultimaCaptura - submitAt,
        });
      };

      // Arranque de captura tras el head-start único.
      const arranque = setTimeout(() => { capturando = true; leer(); }, INICIO_DELAY);

      // Supervisor de fin: ESTABILIDAD DE TEXTO. Verificado por CDP que en
      // Gemini el botón "Detener respuesta" queda presente aunque NO esté
      // generando (persiste 40s+ idle) y el footer .complete casi nunca
      // aparece — ambas señales inútiles. Lo único fiable: el texto deja de
      // crecer. Durante un conteo cambia cada ~50ms; al terminar se queda
      // quieto. idle > FIN_IDLE sin cambios = terminó.
      const FIN_IDLE = 2500;
      const chequearFin = () => {
        if (!capturando || !lastText) return;
        if (Date.now() - lastChange > FIN_IDLE) return terminar('estable');
      };

      const obs = new MutationObserver(() => { leer(); chequearFin(); });
      obs.observe(target, { childList: true, subtree: true, characterData: true });

      // Respaldo por sondeo (por si la última mutación fue la que quitó el
      // stop button y el observer ya no dispara más).
      const poll = setInterval(() => {
        if (cancelToken?.cancelled) return terminar('cancelled');
        leer();
        chequearFin();
        if (Date.now() - start > timeoutMs) return terminar('timeout');
      }, 350);
    });
  }

  async function esperarRespuesta({ base, onChunk, cancelToken, timeoutMs = 90000, submitAt }) {
    const deadline = Date.now() + timeoutMs;
    const target = await esperarTarget(base, Math.min(deadline, Date.now() + 30000));
    if (!target) return { ok: false, text: '', reason: 'never_started', respondeMs: null, generaMs: null };
    return seguirTarget(target, { onChunk, cancelToken, timeoutMs: deadline - Date.now(), submitAt: submitAt || Date.now() });
  }

  // ── bridge: handshake + escuchar ASK ───────────────────
  const post = m => { try { window.parent.postMessage(m, '*'); } catch (_) {} };

  let anuncios = 0;
  const anunciar = () => {
    post({ type: 'AURORA_CLOUD_READY', host: location.hostname });
    if (++anuncios < 20) setTimeout(anunciar, 250);
  };
  anunciar();

  let ocupado = false, cancelActual = null, reqActual = null;

  // Detiene la generación de la nube: cancela nuestra captura Y clickea el
  // botón "Detener respuesta" del sitio (nuestra parada conectada a la suya).
  function detenerNube() {
    if (cancelActual) cancelActual.cancelled = true;
    const stop = getStop();
    if (stop && !stop.disabled) stop.click();
  }

  window.addEventListener('message', async (e) => {
    if (e.data?.type === 'AURORA_CLOUD_STOP') { detenerNube(); return; }
    if (e.data?.type !== 'AURORA_CLOUD_ASK') return;
    const { prompt, requestId } = e.data;
    if (!prompt || !requestId) return;

    // DEDUP: askCloud postea el ASK dos veces (inmediato + retry a 300ms para
    // cubrir el iframe recién montado), ambos con el MISMO requestId. Sin este
    // guard, el segundo cancelaba la captura del primero y re-inyectaba →
    // corte prematuro (vía composer fallaba, directo funcionaba).
    if (requestId === reqActual) return;

    if (ocupado && cancelActual) cancelActual.cancelled = true;
    const cancel = { cancelled: false };
    cancelActual = cancel; reqActual = requestId; ocupado = true;

    try {
      const input = getInput();
      if (!input) { post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false, text: 'Error: no se encontró el input del AI (¿página cargada?)' }); return; }
      // Baseline ANTES de enviar: cuántas respuestas hay y el texto de la
      // última. La respuesta nueva será un elemento de más (o el último si
      // cambia su contenido). Así nunca capturamos el mensaje anterior.
      const base0 = contenedores();
      const base = { count: base0.length, lastText: base0.length ? norm(textOf(base0[base0.length - 1])) : '' };
      injectText(input, prompt);
      await new Promise(r => setTimeout(r, 400));
      submit(input);
      const submitAt = Date.now();   // t0 real: apenas se envía el prompt
      // Throttle del posteo de chunks: sin esto, cada mutación del DOM de
      // Gemini postea un AURORA_CLOUD_CHUNK — un flood de postMessages que
      // satura el main thread de Aurora (congela la app). Posteamos como mucho
      // cada CHUNK_MS; el texto es acumulativo, solo importa el último.
      const CHUNK_MS = 140;
      let ultimoPost = 0, chunkPend = null, chunkTimer = null;
      const postChunk = () => { if (chunkPend != null) post({ type: 'AURORA_CLOUD_CHUNK', requestId, text: chunkPend }); chunkPend = null; ultimoPost = Date.now(); chunkTimer = null; };
      const res = await esperarRespuesta({
        base, cancelToken: cancel, submitAt,
        onChunk: (text) => { chunkPend = text; const d = Date.now() - ultimoPost; if (d >= CHUNK_MS) postChunk(); else if (!chunkTimer) chunkTimer = setTimeout(postChunk, CHUNK_MS - d); },
      });
      if (chunkTimer) { clearTimeout(chunkTimer); chunkTimer = null; }
      post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: res.ok, text: res.text || '(sin respuesta detectada)',
             reason: res.reason, respondeMs: res.respondeMs, generaMs: res.generaMs });
    } catch (err) {
      post({ type: 'AURORA_CLOUD_ANSWER', requestId, ok: false, text: 'Error en cloud-relay: ' + err.message });
    } finally {
      if (reqActual === requestId) ocupado = false;
    }
  });
})();
