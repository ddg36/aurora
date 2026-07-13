// aurora-bridge.js — puente compartido entre Aurora (iframe embebido) y la
// extensión. Usado por CUALQUIER cascarón que embeba Aurora: sidepanel.js Y
// app.js (newtab, chrome_url_overrides.newtab). Antes esta lógica vivía SÓLO
// en sidepanel.js — abrir Aurora en pestaña nueva nunca mandaba el handshake
// AURORA_EXT_HELLO ni manejaba AURORA_LLM_PANES, así que ahí Aurora caía al
// iframe inline de LLM cloud (el que SÍ sufre cookie-partitioning, que este
// mismo puente existe para evitar) — bug real: login/sesión de LLM se perdía
// SOLO en modo pestaña nueva, andaba bien en el side panel, porque eran dos
// implementaciones divergentes de lo mismo. Un solo módulo: cualquier
// cascarón nuevo lo hereda gratis y ya no puede volver a divergir.
//
// Uso: <script src="aurora-bridge.js"></script> ANTES del script propio del
// cascarón, que llama initAuroraBridge(frameEl, { surface: 'sidepanel'|'newtab' })
// una sola vez, apenas tiene la referencia al <iframe> — no hace falta
// esperar a que su `src` esté seteado, el puente sólo escucha eventos.

function initAuroraBridge(frame, opts) {
  const { serverUrl = 'http://localhost:7779', surface = 'sidepanel' } = opts || {};
  const AURORA_URL = serverUrl;
  const ACTIVE_EXTENSIONS = ['aihub'];
  let _auroraToken = null;

  // ── Keep-alive anti-throttle ──────────────────────────────────
  // Chrome estrangula los timers (setTimeout/Interval) de una TAB en segundo
  // plano; con ellos se frena el iframe del LLM cloud → generación y detección
  // se cuelgan. Una tab que reproduce audio queda EXENTA del throttle. Metemos
  // un oscilador sub-audible (20Hz, ganancia casi nula): inaudible, pero marca
  // la tab como "audible" y la mantiene viva aunque no esté enfocada.
  let _audioKeepAlive = null;
  function iniciarKeepAlive() {
    if (_audioKeepAlive) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0015;         // inaudible para el humano, audible para Chrome
      osc.frequency.value = 20;         // sub-audible
      osc.type = 'sine';
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      _audioKeepAlive = ctx;
      const resume = () => { if (ctx.state === 'suspended') ctx.resume(); };
      resume();
      // El autoplay puede quedar suspendido hasta el 1er gesto: lo reanudamos.
      window.addEventListener('click', resume, true);
      window.addEventListener('keydown', resume, true);
    } catch (_) {}
  }
  iniciarKeepAlive();

  // ── Bridge logging (accesible via CDP desde background) ──────
  window.__aurora_bridgeLog = window.__aurora_bridgeLog || [];
  const _log = (type, detail) => {
    const entry = { t: Date.now(), type, detail };
    window.__aurora_bridgeLog.push(entry);
    if (window.__aurora_bridgeLog.length > 200) window.__aurora_bridgeLog.shift();
    console.log('[BRIDGE]', type, JSON.stringify(detail).slice(0, 200));
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AURORA_TOKEN_UPDATE') {
      _log('token_update', { token: msg.token?.slice(0, 8) });
      _auroraToken = msg.token;
      if (frame.contentWindow) {
        frame.contentWindow.postMessage({
          type: 'AURORA_TOKEN',
          token: msg.token,
          usuario_id: msg.usuario_id,
          serverUrl: msg.serverUrl || AURORA_URL,
        }, AURORA_URL);
      }
    }
  });

  let _helloInterval = null;

  function sendHello() {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type:        'AURORA_EXT_HELLO',
      extensionId: chrome.runtime.id,
      extensions:  ACTIVE_EXTENSIONS,
      caps:        ['llmPanes'], // cualquier superficie con este puente sabe montar iframes de LLM
      surface,     // 'sidepanel' | 'newtab' — para features que sólo tienen sentido en una de las dos
      token:       _auroraToken,
    }, AURORA_URL);
  }

  function startHelloLoop() {
    stopHelloLoop();
    sendHello();
    _helloInterval = setInterval(sendHello, 800);
  }

  function stopHelloLoop() {
    if (_helloInterval) { clearInterval(_helloInterval); _helloInterval = null; }
  }

  function replyToFrame(id, result) {
    if (!frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: 'AURORA_BG_RESPONSE', id, result }, AURORA_URL);
  }

  frame.addEventListener('load', () => {
    // Aurora (#frame) recargó/navegó → los iframes de LLM que montamos quedan
    // huérfanos (el documento nuevo no los conoce y no manda cleanup). Los
    // borramos acá; si la vista LLM Cloud vuelve a estar activa, Aurora re-pide
    // sus paneles. Sin esto, el iframe del LLM quedaba pegado encima de otras
    // tabs tras un reload.
    clearLlmFrames();
    closeLlmMenu();
    setTimeout(startHelloLoop, 300);
  });

  // ── LLM cloud: iframes gestionados a nivel de extensión ───────
  // Aurora (dentro de #frame) manda los paneles a mostrar con su rect en px.
  // Creamos/posicionamos los <iframe> acá, como hijos DIRECTOS de la página de
  // extensión (chrome-extension://), para que el login del LLM no se rompa por
  // cookie partitioning — regla de Chrome: si el top-level de la pestaña es una
  // página chrome-extension:// y la extensión tiene host_permissions del sitio
  // embebido, ese sitio accede a su partición top-level (cookies sin partición).
  // Cuando el iframe cuelga de localhost:7779 (como pasaba en newtab antes de
  // este puente compartido), eso NO aplica.
  //
  // La capa se crea acá mismo (no en el HTML): así ningún cascarón nuevo
  // necesita marcado propio para esto, sólo incluir este script.
  const _llmLayer = document.createElement('div');
  _llmLayer.id = 'llm-layer';
  _llmLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
  document.body.appendChild(_llmLayer);
  const _llmFrames = new Map(); // id -> iframe

  // Aurora vive dentro de #auroraFrame y reporta rects relativos a SU
  // viewport. Convertirlos al viewport de la página extensión; antes faltaba
  // sumar el offset superior del shell y el iframe LLM tapaba la cabecera.
  function rectDesdeAurora(r) {
    const host = frame.getBoundingClientRect();
    const sx = host.width / (frame.clientWidth || host.width || 1);
    const sy = host.height / (frame.clientHeight || host.height || 1);
    return {
      left: host.left + r.left * sx,
      top: host.top + r.top * sy,
      width: r.width * sx,
      height: r.height * sy,
      bottom: host.top + (r.top + r.height) * sy,
    };
  }

  function clearLlmFrames() {
    for (const [, f] of _llmFrames) f.remove();
    _llmFrames.clear();
  }

  // `hidden` sólo esconde (visibility) sin tocar el src — así abrir el dropdown
  // de Aurora, el modal Duo, o cambiar de TAB dentro de Aurora (salir de LLM
  // Cloud a otra vista) no recarga el LLM ni pierde un login/hilo en curso. El
  // caller (llmcloud.js) sigue mandando el mismo pane con hidden:true al
  // desmontarse — la sesión queda viva de fondo, como una pestaña de browser en
  // background. Un iframe se QUITA de verdad sólo cuando su id ya no está en la
  // lista (split apagado saca el pane 'der') o cambia de URL (LLM distinto
  // elegido para el mismo lado).
  function syncLlmPanes(panes, hidden) {
    const vistos = new Set();
    for (const pane of (panes || [])) {
      vistos.add(pane.id);
      let f = _llmFrames.get(pane.id);
      if (!f) {
        f = document.createElement('iframe');
        f.allow = 'clipboard-read; clipboard-write; microphone; camera; identity-credentials-get; publickey-credentials-get';
        // Estilo base inline, no vía CSS del HTML host — así cualquier
        // cascarón que incluya este script funciona sin marcado propio.
        f.style.cssText = 'position:absolute;border:none;display:block;background:#fff;pointer-events:auto;';
        _llmLayer.appendChild(f);
        _llmFrames.set(pane.id, f);
      }
      if (f.dataset.url !== pane.url) { f.dataset.url = pane.url; f.src = pane.url; }
      const r = rectDesdeAurora(pane.rect);
      f.style.left = r.left + 'px';
      f.style.top = r.top + 'px';
      f.style.width = r.width + 'px';
      f.style.height = r.height + 'px';
      f.style.visibility = hidden ? 'hidden' : 'visible';
    }
    for (const [id, f] of _llmFrames) {
      if (!vistos.has(id)) { f.remove(); _llmFrames.delete(id); }
    }
  }

  // Menú de selección de LLM dibujado a nivel de extensión, ENCIMA de los
  // iframes (que también viven acá). Aurora no puede dibujar encima porque su
  // UI vive en #frame, detrás de esta capa — así que manda las opciones + el
  // rect del botón ancla, y acá se pinta el menú y se avisa la elección.
  let _llmMenuEl = null;

  function closeLlmMenu() {
    if (_llmMenuEl) { _llmMenuEl.remove(); _llmMenuEl = null; }
  }

  function openLlmMenu(anchor, options, activeIds) {
    closeLlmMenu();
    anchor = rectDesdeAurora({ ...anchor, width: anchor.width || 0, height: (anchor.bottom || anchor.top) - anchor.top });
    const m = document.createElement('div');
    m.style.cssText = `position:absolute;left:${anchor.left}px;top:${anchor.bottom + 4}px;width:220px;max-height:320px;overflow-y:auto;z-index:2147483647;background:#14141c;border:1px solid rgba(255,255,255,.12);border-radius:8px;box-shadow:0 12px 32px rgba(0,0,0,.5);padding:4px;display:flex;flex-direction:column;gap:2px;pointer-events:auto;font:12px system-ui;`;
    for (const u of options) {
      const b = document.createElement('button');
      const active = activeIds.includes(u.id);
      b.style.cssText = `display:flex;align-items:center;gap:8px;padding:6px 8px;border:0;border-radius:6px;text-align:left;cursor:pointer;background:${active ? 'rgba(255,255,255,.1)' : 'transparent'};color:${active ? '#fff' : 'rgba(255,255,255,.6)'};font:12px system-ui;`;
      b.onmouseenter = () => { if (!active) b.style.background = 'rgba(255,255,255,.05)'; };
      b.onmouseleave = () => { if (!active) b.style.background = 'transparent'; };
      if (u.icono) {
        const img = document.createElement('img');
        img.src = u.icono; img.style.cssText = 'width:16px;height:16px;border-radius:3px;flex-shrink:0;';
        img.onerror = () => { img.style.display = 'none'; };
        b.appendChild(img);
      }
      const sp = document.createElement('span');
      sp.textContent = u.nombre; sp.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      b.appendChild(sp);
      if (u.soloTab) {
        const tag = document.createElement('span');
        tag.textContent = '↗'; tag.title = 'Se abre en pestaña (bloqueado en panel)';
        tag.style.cssText = 'opacity:.5;flex-shrink:0;';
        b.appendChild(tag);
      }
      b.onclick = () => {
        frame.contentWindow?.postMessage({ type: 'AURORA_LLM_MENU_PICK', id: u.id }, AURORA_URL);
        closeLlmMenu();
      };
      m.appendChild(b);
    }
    _llmLayer.appendChild(m);
    _llmMenuEl = m;
    // cerrar al clickear fuera
    setTimeout(() => {
      const onDown = (ev) => {
        if (_llmMenuEl && !_llmMenuEl.contains(ev.target)) {
          closeLlmMenu();
          document.removeEventListener('mousedown', onDown, true);
          frame.contentWindow?.postMessage({ type: 'AURORA_LLM_MENU_CLOSED' }, AURORA_URL);
        }
      };
      document.addEventListener('mousedown', onDown, true);
    }, 0);
  }

  window.addEventListener('message', (e) => {
    // ── Relay del tool-loop LLM cloud (extPane) ───────────────────
    // El iframe del LLM vive acá (hijo de la extensión), no dentro de Aurora,
    // así que Aurora no puede hablarle directo. Reenviamos en ambos sentidos:
    // Respuestas del relay (origin = host del LLM) → Aurora.
    const t = e.data?.type;
    if (t === 'AURORA_CLOUD_CHUNK' || t === 'AURORA_CLOUD_ANSWER' || t === 'AURORA_CLOUD_READY' || t === 'AURORA_CLOUD_STATUS' || t === 'AURORA_CLOUD_RESETTING') {
      const paneId = [..._llmFrames].find(([, iframe]) => iframe.contentWindow === e.source)?.[0] || e.data.__llmPane || 'cloud';
      frame.contentWindow?.postMessage({ ...e.data, __llmPane: paneId }, AURORA_URL);
      return;
    }
    // ASK/STOP de Aurora → iframe del LLM que gestionamos.
    if (e.origin === AURORA_URL && (t === 'AURORA_CLOUD_ASK' || t === 'AURORA_CLOUD_STOP' || t === 'AURORA_CLOUD_PING')) {
      _llmFrames.get(e.data.__llmPane || 'cloud')?.contentWindow?.postMessage(e.data, '*');
      return;
    }

    if (e.origin !== AURORA_URL) return;

    if (e.data?.type === 'AURORA_LLM_PANES') { syncLlmPanes(e.data.panes, e.data.hidden); return; }
    if (e.data?.type === 'AURORA_LLM_RELOAD') {
      const f = _llmFrames.get(e.data.id || 'cloud');
      if (f) {
        const url = e.data.url || f.dataset.url;
        f.src = 'about:blank';
        setTimeout(() => { if (url && f.isConnected) f.src = url; }, 60);
      }
      return;
    }
    if (e.data?.type === 'AURORA_LLM_MENU_OPEN') { openLlmMenu(e.data.anchor, e.data.options, e.data.activeIds || []); return; }
    if (e.data?.type === 'AURORA_LLM_MENU_CLOSE') { closeLlmMenu(); return; }

    if (e.data?.type === 'AURORA_EXT_ACK') { _log('ack', {}); stopHelloLoop(); return; }

    if (e.data?.type === 'AURORA_BG_REQUEST') {
      const { id, payload } = e.data;
      _log('bg_request', { id, type: payload?.type, args: Object.keys(payload || {}).join(',') });

      // Clipboard — este documento tiene acceso directo, el SW no.
      if (payload?.type === 'CLIPBOARD_WRITE') {
        navigator.clipboard.writeText(payload.text || '')
          .then(() => { _log('bg_response', { id, ok: true }); replyToFrame(id, { ok: true }); })
          .catch(err => { _log('bg_response', { id, error: err.message }); replyToFrame(id, { ok: false, error: err.message }); });
        return;
      }

      if (payload?.type === 'CLIPBOARD_READ') {
        navigator.clipboard.readText()
          .then(text => { _log('bg_response', { id, ok: true, len: text.length }); replyToFrame(id, { ok: true, text }); })
          .catch(err => { _log('bg_response', { id, error: err.message }); replyToFrame(id, { ok: false, error: err.message, text: '' }); });
        return;
      }

      // Todo lo demás → background
      _log('bg_forward', { id, type: payload?.type });
      const t0 = Date.now();
      chrome.runtime.sendMessage(payload, (res) => {
        const elapsed = Date.now() - t0;
        _log('bg_response', { id, elapsed, ok: res?.success, error: res?.error?.slice(0, 100), type: payload?.type });
        replyToFrame(id, res);
      });
    }
  });

  return { startHelloLoop, stopHelloLoop };
}
