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

  // ── Workspace/superficie durable ──────────────────────────────
  // Cada shell que contiene Aurora anuncia qué superficie representa. El
  // background persiste este estado en chrome.storage.local + SQLite y puede
  // reconstruir la última configuración después de reiniciar navegador o
  // extensión. sessionStorage conserva el mismo id durante un hard reload.
  const _surfaceInstanceId = (() => {
    const key = 'aurora_surface_instance_id_v1';
    try {
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = globalThis.crypto?.randomUUID?.() || `surface-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(key, id);
      }
      return id;
    } catch (_) {
      return globalThis.crypto?.randomUUID?.() || `surface-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  })();

  // La tab helper que background.js abre para forzar sidePanel.open() (ver
  // _abrirSidePanelForzado) es un newtab.html real, pero NO representa uso
  // genuino del usuario — sin este corte, su propio 'init' se registraba
  // como "newtab abierto", y el siguiente restore reabría un newtab de
  // verdad que el usuario nunca había tenido abierto (confirmado en vivo:
  // "recargar Aurora" con SOLO el sidepanel abierto terminaba abriendo
  // también un newtab de la nada).
  const _esHelperInterno = new URLSearchParams(location.search).get('aurora_helper') === '1';

  function reportarSuperficie(phase) {
    if (_esHelperInterno) return;
    const payload = {
      type: 'AURORA_SURFACE_STATE',
      surface,
      instanceId: _surfaceInstanceId,
      phase: phase || 'state',
      visible: document.visibilityState !== 'hidden',
      focused: document.hasFocus(),
      ts: Date.now(),
    };
    try {
      const pending = chrome.runtime.sendMessage(payload);
      pending?.catch?.(() => {});
    } catch (_) {}
  }

  if (!_esHelperInterno) {
    // Puerto dedicado SOLO para detectar cierre real: `pagehide` + sendMessage
    // async no siempre alcanza a completarse antes de que el navegador destruya
    // la página (tab cerrada de golpe, proceso matado) — confirmado en vivo,
    // el snapshot seguía marcando `open:true` después de cerrar la tab.
    // onDisconnect del puerto SÍ dispara siempre que el otro extremo muere,
    // sin depender de que la página misma alcance a avisar nada.
    try {
      const port = chrome.runtime.connect({ name: `aurora_surface:${surface}:${_surfaceInstanceId}` });
      port.onDisconnect.addListener(() => {});
    } catch (_) {}

    queueMicrotask(() => reportarSuperficie('init'));
    window.addEventListener('focus', () => reportarSuperficie('focus'), true);
    window.addEventListener('blur', () => reportarSuperficie('blur'), true);
    document.addEventListener('visibilitychange', () => reportarSuperficie('visibility'));
    window.addEventListener('pagehide', () => reportarSuperficie('pagehide'));
    // El chequeo de "¿hay algo abierto ahora?" del lado background descarta
    // instancias con más de unos minutos sin reportarse (ver background.js) —
    // sin este heartbeat, una tab genuinamente abierta pero quieta (el usuario
    // leyendo, sin cambiar de foco/tab) podía "envejecer" y contarse como
    // cerrada por error. Late cada minuto mientras exista, sin depender de
    // ninguna interacción real del usuario.
    setInterval(() => reportarSuperficie('heartbeat'), 60000);
  }

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
    // Dar tiempo a que el módulo cloud-ask instale su listener en el documento
    // nuevo; luego reentregar cualquier respuesta todavía no confirmada.
    setTimeout(() => reenviarCloudOutbox('aurora_frame_load'), 700);
    setTimeout(() => reenviarCloudOutbox('aurora_frame_load_retry'), 2200);
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

  // ── Outbox durable de respuestas Cloud ────────────────────────
  // El relay del proveedor produce una respuesta una sola vez. Guardarla ANTES
  // de entregarla a Aurora evita perderla si el iframe de Aurora o la extensión
  // se recargan en esa ventana. Se elimina únicamente con ACK explícito.
  // Persistido en la DB del server (ajuste por usuario), no en chrome.storage.local:
  // la base de datos es el único store de datos; el browser storage solo replicaba.
  const CLOUD_OUTBOX_CLAVE = 'cloud_answer_outbox_v1';
  let _cloudOutboxQueue = Promise.resolve();

  const cloudOutboxId = (requestId, paneId = 'cloud') => `${paneId}:${requestId}`;

  function conCloudOutbox(task) {
    const run = () => Promise.resolve().then(task);
    _cloudOutboxQueue = _cloudOutboxQueue.then(run, run);
    return _cloudOutboxQueue;
  }

  async function leerCloudOutbox() {
    if (!_auroraToken) return {};
    const res = await fetch(`${AURORA_URL}/db/ajustes/${CLOUD_OUTBOX_CLAVE}`, {
      headers: { Authorization: `Bearer ${_auroraToken}` },
    });
    if (!res.ok) return {};
    const body = await res.json().catch(() => null);
    if (!body?.valor) return {};
    try {
      const value = JSON.parse(body.valor);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  async function escribirCloudOutbox(outbox) {
    if (!_auroraToken) return;
    await fetch(`${AURORA_URL}/db/ajustes/${CLOUD_OUTBOX_CLAVE}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_auroraToken}` },
      body: JSON.stringify({ valor: JSON.stringify(outbox) }),
    });
  }

  function guardarCloudAnswer(message) {
    return conCloudOutbox(async () => {
      const outbox = await leerCloudOutbox();
      const paneId = message.__llmPane || 'cloud';
      const id = cloudOutboxId(message.requestId, paneId);
      // NO persistir las imágenes base64 (1-3MB c/u): el outbox se guarda como
      // JSON en un ajuste; incrustar imágenes en cada answer lo bloatea. La
      // entrega EN VIVO sí lleva las imágenes; el outbox es solo respaldo de
      // reintento del texto. (Si se reenvía por outbox, va sin imágenes —
      // aceptable para un caso de recuperación raro.)
      const liviano = { ...message, __llmPane: paneId };
      if (liviano.images) delete liviano.images;
      outbox[id] = {
        message: liviano,
        savedAt: outbox[id]?.savedAt || Date.now(),
        updatedAt: Date.now(),
      };
      await escribirCloudOutbox(outbox);
      _log('cloud_answer_stored', { requestId: message.requestId, paneId, imgs: message.images?.length || 0 });
      return liviano;
    });
  }

  function confirmarCloudAnswer(requestId, paneId = 'cloud') {
    if (!requestId) return Promise.resolve(false);
    return conCloudOutbox(async () => {
      const outbox = await leerCloudOutbox();
      const id = cloudOutboxId(requestId, paneId);
      if (!outbox[id]) return false;
      delete outbox[id];
      await escribirCloudOutbox(outbox);
      _log('cloud_answer_acked', { requestId, paneId });
      return true;
    });
  }

  async function reenviarCloudOutbox(reason = 'sync') {
    try {
      const outbox = await leerCloudOutbox();
      const entries = Object.values(outbox).sort((a, b) => Number(a.savedAt || 0) - Number(b.savedAt || 0));
      for (const entry of entries) {
        if (!entry?.message?.requestId) continue;
        frame.contentWindow?.postMessage({
          ...entry.message,
          __auroraOutboxReplay: true,
        }, AURORA_URL);
      }
      if (entries.length) _log('cloud_outbox_replay', { reason, count: entries.length });
      return entries.length;
    } catch (error) {
      _log('cloud_outbox_error', { reason, error: error?.message || String(error) });
      return 0;
    }
  }

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

  function relayContextForPane(pane) {
    const paneId = String(pane?.id || 'cloud');
    return {
      surface: String(pane?.surface || 'llmcloud'),
      surfaceInstanceId: _surfaceInstanceId,
      paneId,
      channelId: `${_surfaceInstanceId}:${paneId}`,
      role: pane?.role == null ? null : String(pane.role),
      runId: pane?.runId == null ? null : String(pane.runId),
      mode: 'embedded',
    };
  }

  function bindRelayFrame(iframe) {
    const context = iframe?.__auroraRelayContext;
    if (!context || !iframe.contentWindow) return false;
    try {
      iframe.contentWindow.postMessage({ type: 'AURORA_RELAY_BIND', context }, '*');
      _log('relay_bind', { surface: context.surface, paneId: context.paneId, channelId: context.channelId });
      return true;
    } catch (_) { return false; }
  }

  // `hidden` sólo esconde sin tocar el src — así abrir el dropdown
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
        f.addEventListener('load', () => {
          bindRelayFrame(f);
          // El content script puede arrancar después del evento load.
          setTimeout(() => bindRelayFrame(f), 350);
          setTimeout(() => bindRelayFrame(f), 1200);
        });
      }
      f.__auroraRelayContext = relayContextForPane(pane);
      if (f.dataset.url !== pane.url) { f.dataset.url = pane.url; f.src = pane.url; }
      else bindRelayFrame(f);
      const r = rectDesdeAurora(pane.rect);
      f.style.left = r.left + 'px';
      f.style.top = r.top + 'px';
      f.style.width = r.width + 'px';
      f.style.height = r.height + 'px';
      // visibility:hidden / opacity:0 congelan requestAnimationFrame dentro
      // del iframe (verificado: con cualquiera de los dos, rAF no dispara NI
      // UNA VEZ; sin ellos, ~33fps normales). ChatGPT anima su streaming vía
      // rAF — con el panel "oculto" así, el turno queda con el DOM vacío
      // para siempre (el <div> de streaming nunca se pinta), aunque
      // document.hidden del iframe siga en false (esa API sólo mide la tab
      // top, no visibility/opacity de un iframe embebido — el sitio no tiene
      // forma de notar ni compensar esto). El tamaño ya lo hace invisible al
      // ojo (rect llega en ~1px cuando hidden), así que ocultar por tamaño
      // + pointer-events:none alcanza sin pagar el freeze de rAF.
      f.style.pointerEvents = hidden ? 'none' : 'auto';
      f.setAttribute('aria-hidden', hidden ? 'true' : 'false');
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
    if (t === 'AURORA_CLOUD_CHUNK' || t === 'AURORA_CLOUD_ANSWER' || t === 'AURORA_CLOUD_NEW_CHAT_ANSWER' || t === 'AURORA_CLOUD_READY' || t === 'AURORA_CLOUD_STATUS' || t === 'AURORA_CLOUD_RESETTING' || t === 'AURORA_RELAY_BOUND' || t === 'AURORA_CLOUD_NAV_CHANGED' || t === 'AURORA_CLOUD_SYNC_HILO' || t === 'AURORA_CLOUD_WHERE_AM_I_ANSWER' || t === 'AURORA_CLOUD_TOOL_STALLED' || t === 'AURORA_CLOUD_ANSWER_NOW_ANSWER') {
      const matchedFrame = [..._llmFrames].find(([, iframe]) => iframe.contentWindow === e.source);
      const paneId = matchedFrame?.[0] || e.data.__llmPane || 'cloud';
      if (t === 'AURORA_CLOUD_READY' && matchedFrame?.[1]) bindRelayFrame(matchedFrame[1]);
      // El relay navega el iframe DESDE ADENTRO (location.assign, ej. "Nuevo
      // chat") sin pasar por syncLlmPanes — dataset.url (el bookkeeping que
      // syncLlmPanes usa para decidir si reasignar f.src) queda desactualizado
      // apenas eso pasa. Cuando React después actualiza cloudUrl al mismo
      // valor YA correcto, syncLlmPanes lo compara contra el dataset.url
      // VIEJO, ve una diferencia falsa y reasigna f.src — una SEGUNDA
      // navegación real, redundante, a la misma URL (confirmado en vivo con
      // el trace: dos relay_loaded ~550ms apartados por un solo click de
      // "Nuevo chat"). El propio relay conoce su URL real al navegar — usarla
      // para mantener el bookkeeping al día evita el eco.
      if (matchedFrame?.[1] && e.data.url && (t === 'AURORA_CLOUD_NAV_CHANGED' || t === 'AURORA_CLOUD_NEW_CHAT_ANSWER')) {
        matchedFrame[1].dataset.url = e.data.url;
      }
      const forwarded = { ...e.data, __llmPane: paneId };
      if (t === 'AURORA_CLOUD_ANSWER' && e.data.requestId) {
        // Persistir primero; recién después entregar. Si storage falla, entregar
        // igualmente para no bloquear el turno vivo, pero dejar traza explícita.
        // Entregar SIEMPRE el mensaje completo (con imágenes); el outbox guarda
        // una versión liviana sin base64 solo para reintento.
        guardarCloudAnswer(forwarded)
          .catch(error => _log('cloud_answer_store_failed', { requestId: e.data.requestId, error: error?.message || String(error) }))
          .finally(() => frame.contentWindow?.postMessage(forwarded, AURORA_URL));
      } else {
        frame.contentWindow?.postMessage(forwarded, AURORA_URL);
      }
      return;
    }
    // ASK/STOP/NEW_CHAT de Aurora → iframe del LLM que gestionamos.
    if (e.origin === AURORA_URL && (t === 'AURORA_CLOUD_ASK' || t === 'AURORA_CLOUD_STOP' || t === 'AURORA_CLOUD_PING' || t === 'AURORA_CLOUD_NEW_CHAT' || t === 'AURORA_CLOUD_WHERE_AM_I' || t === 'AURORA_CLOUD_ANSWER_NOW')) {
      _llmFrames.get(e.data.__llmPane || 'cloud')?.contentWindow?.postMessage(e.data, '*');
      return;
    }

    if (e.origin !== AURORA_URL) return;

    if (e.data?.type === 'AURORA_CLOUD_ACK') {
      confirmarCloudAnswer(e.data.requestId, e.data.__llmPane || 'cloud').catch(() => {});
      return;
    }
    if (e.data?.type === 'AURORA_CLOUD_OUTBOX_SYNC') {
      reenviarCloudOutbox('aurora_requested');
      return;
    }

    if (e.data?.type === 'AURORA_LLM_PANES') { syncLlmPanes(e.data.panes, e.data.hidden); return; }
    if (e.data?.type === 'AURORA_LLM_RELOAD') {
      const paneId = e.data.id || 'cloud';
      const f = _llmFrames.get(paneId);
      if (f) {
        const url = e.data.url || f.dataset.url;
        // Una navegación destruye el content script y con él cualquier ASK
        // activa. Avisar antes de poner about:blank evita que Aurora espere el
        // timeout completo por una respuesta que ya no puede existir.
        frame.contentWindow?.postMessage({
          type: 'AURORA_CLOUD_RESETTING', reason: 'pane_reload', __llmPane: paneId,
        }, AURORA_URL);
        f.src = 'about:blank';
        setTimeout(() => { if (url && f.isConnected) f.src = url; }, 60);
      }
      return;
    }
    if (e.data?.type === 'AURORA_LLM_MENU_OPEN') { openLlmMenu(e.data.anchor, e.data.options, e.data.activeIds || []); return; }
    if (e.data?.type === 'AURORA_LLM_MENU_CLOSE') { closeLlmMenu(); return; }

    if (e.data?.type === 'AURORA_EXT_ACK') {
      _log('ack', {});
      stopHelloLoop();
      reenviarCloudOutbox('extension_handshake');
      return;
    }

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
