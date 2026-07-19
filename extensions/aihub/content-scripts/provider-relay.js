// Courier isolated de Relay Family. No conoce el DOM ni ejecuta tools:
// pide una foto semántica al Provider Driver MAIN y habla con JSON Family.
(function installProviderRelay() {
  'use strict';
  const COURIER_BUILD = '2026-07-18.4-channel-recovery';
  const previousInstall = globalThis.__auroraProviderRelayInstall;
  if (previousInstall?.build === COURIER_BUILD) return;
  try { previousInstall?.dispose?.('upgrade'); } catch (_) {}
  const installation = globalThis.__auroraProviderRelayInstall = {
    build: COURIER_BUILD, installedAt: Date.now(), dispose: null,
  };
  let enabled = false, timer = null, processing = false;
  let lastFingerprint = '', stableCandidate = null, pending = null, lastSnapshot = null;
  let endpointHeartbeatTimer = null, domObserver = null, disposed = false;

  // Log temporal con timestamp + visibilidad, para diagnosticar cuelgues
  // reportados al perder foco/minimizar/cambiar de tab durante una
  // generación. En sessionStorage (no window.*) porque el content script
  // corre en ISOLATED world: window.* ahí es invisible para Runtime.evaluate
  // en el MAIN world (lo que usan las herramientas de debug de CDP);
  // sessionStorage sí es compartido entre ambos en el mismo origin.
  const RELAY_LOG_KEY = 'aurora_relay_log_v1';
  function relayLog(phase, detail = '') {
    let arr;
    try { arr = JSON.parse(sessionStorage.getItem(RELAY_LOG_KEY) || '[]'); } catch (_) { arr = []; }
    arr.push({ t: Date.now(), phase, detail: String(detail || '').slice(0, 240), hidden: document.hidden, hasFocus: document.hasFocus() });
    if (arr.length > 300) arr = arr.slice(-300);
    try { sessionStorage.setItem(RELAY_LOG_KEY, JSON.stringify(arr)); } catch (_) {}
  }
  const mark = (phase, detail = '') => {
    const root = document.documentElement;
    relayLog(phase, detail);
    if (!root) return;
    root.dataset.auroraProviderRelay = phase;
    root.dataset.auroraProviderRelayDetail = String(detail || '').slice(0, 240);
  };
  document.addEventListener('visibilitychange', () => relayLog('visibilitychange', document.hidden ? 'hidden' : 'visible'));
  window.addEventListener('focus', () => relayLog('window_focus'));
  window.addEventListener('blur', () => relayLog('window_blur'));
  const isTransientRuntimeError = message => /(?:message channel closed before a response was received|message port closed before a response was received|extension context invalidated|receiving end does not exist)/i.test(String(message || ''));

  const runtimeErrorResult = message => {
    const detail = String(message || 'runtime_message_failed');
    return isTransientRuntimeError(detail)
      ? { ok: false, transient: true, error: 'runtime_channel_closed', detail }
      : { ok: false, error: detail };
  };

  const runtimeMessage = (payload, timeoutMs = 35000) => new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish({
      ok: false,
      error: `runtime_message_timeout:${payload?.type || 'unknown'}`,
    }), timeoutMs);
    try {
      chrome.runtime.sendMessage(payload, response => {
        const error = chrome.runtime.lastError;
        finish(error ? runtimeErrorResult(error.message) : response);
      });
    } catch (error) {
      finish(runtimeErrorResult(error?.message || String(error)));
    }
  });

  // Fallback MISMO-FRAME (isolated → MAIN, ver relay-core.js) para cuando
  // este courier vive dentro de un frame SIN tab (side panel: confirmado en
  // vivo que chrome.tabs.getCurrent() da null ahí) — chrome.scripting.
  // executeScript, que usa background.js para snapshotProvider/deliverToOrigin,
  // EXIGE tabId y no puede alcanzar ese frame. postMessage no depende de tabs:
  // isolated y MAIN comparten el mismo `window`. Solo se intenta cuando el
  // camino normal (background) falla específicamente por falta de tab — el
  // caso común (tab/newtab) sigue exactamente igual que antes.
  const SIN_TAB_ERROR = /no pertenece a una pesta.a viva/i;
  function sameFrameRequest(type, responseType, payload, timeoutMs = 15000) {
    return new Promise(resolve => {
      const requestId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        window.removeEventListener('message', onMsg);
        clearTimeout(timer);
        resolve(value);
      };
      const onMsg = e => {
        if (e.data?.type === responseType && e.data.requestId === requestId) finish(e.data);
      };
      window.addEventListener('message', onMsg);
      const timer = setTimeout(() => finish({ ok: false, delivered: false, error: 'same_frame_timeout' }), timeoutMs);
      window.postMessage({ type, requestId, ...payload }, '*');
    });
  }
  const sameFrameSnapshot = () => sameFrameRequest('AURORA_MAIN_SNAPSHOT_REQUEST', 'AURORA_MAIN_SNAPSHOT_RESPONSE', {});
  const sameFrameDeliver = delivery => sameFrameRequest('AURORA_MAIN_DELIVER_REQUEST', 'AURORA_MAIN_DELIVER_RESPONSE', { delivery });

  let heartbeatBusy = false;
  async function endpointHeartbeat(phase = 'heartbeat') {
    if (heartbeatBusy || disposed) return;
    heartbeatBusy = true;
    try {
      const result = await runtimeMessage({ type: 'AURORA_ENDPOINT_HEARTBEAT', phase });
      const endpoint = result?.endpoint;
      const root = document.documentElement;
      if (!root || disposed) return;
      root.dataset.auroraEndpointRegistry = result?.ok
        ? (endpoint?.ignored ? 'ignored' : 'registered') : 'error';
      root.dataset.auroraEndpointRegistryDetail = result?.ok
        ? (endpoint?.ignored ? endpoint.reason : `${endpoint?.endpointId || 'unknown'}:${endpoint?.state || 'unknown'}`)
        : String(result?.error || 'heartbeat_failed').slice(0, 240);
      if (endpoint?.endpointId) root.dataset.auroraEndpointId = endpoint.endpointId;
      else delete root.dataset.auroraEndpointId;
    } finally {
      heartbeatBusy = false;
    }
  }

  const fingerprint = text => {
    let hash = 5381;
    for (const char of String(text || '')) hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
    return (hash >>> 0).toString(36);
  };

  const turnKey = snapshot => snapshot.turnId
    ? String(snapshot.turnId)
    : `${snapshot.conversation}:assistant-${Math.max(0, snapshot.turnIndex ?? 0)}`;

  const currentFingerprint = snapshot => `${turnKey(snapshot)}\n${fingerprint(snapshot.text)}`;

  async function stableRequestId(snapshot) {
    const material = `${snapshot.provider}\n${snapshot.adapter}\n${turnKey(snapshot)}\n${snapshot.text}`;
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
      const digest = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
      return `relay-v2-${digest.slice(0, 32)}`;
    } catch (_) { return `relay-v2-${fingerprint(material)}-${material.length}`; }
  }
  const origin = snapshot => ({
    relay: `provider-${snapshot.adapter}-v2`, adapter: snapshot.adapter,
    provider: snapshot.provider, surface: window === window.top ? 'tab' : 'iframe',
    conversation: snapshot.conversation,
    endpointId: document.documentElement?.dataset?.auroraEndpointId || null,
  });

  async function inspect() {
    timer = null;
    if (disposed || globalThis.__auroraProviderRelayInstall !== installation) return;
    if (!enabled) return mark('off');
    const root = document.documentElement;
    if (!root) return;
    if (processing || root.dataset.auroraCloudAskActive === '1') {
      return mark('waiting', processing ? 'aurora_processing' : 'cloud_ask_active');
    }
    let snapshotResult = await runtimeMessage({ type: 'AURORA_RELAY_SNAPSHOT' });
    if (!snapshotResult?.ok && SIN_TAB_ERROR.test(snapshotResult?.error || '')) {
      snapshotResult = await sameFrameSnapshot();
    }
    if (!snapshotResult?.ok) {
      if (snapshotResult?.transient) {
        mark('waiting', 'runtime_channel_reconnecting');
      } else {
        mark('error', snapshotResult?.error || 'provider_snapshot_failed');
      }
      return schedule(1600);
    }
    const snapshot = snapshotResult.snapshot;
    lastSnapshot = snapshot;
    root.dataset.auroraProviderRelayAdapter = snapshot.adapter;
    if (snapshot.generating) return mark('waiting', 'provider_generating');

    const text = pending?.text || String(snapshot.text || '').trim();
    if (!text) { stableCandidate = null; return mark('idle', 'no_assistant'); }
    const raw = pending?.raw || String(snapshot.raw || text).trim();
    const consumed = root.dataset.auroraJsonFamilyConsumed;
    if (consumed && (consumed === fingerprint(text) || consumed === fingerprint(raw))) {
      lastFingerprint = currentFingerprint(snapshot);
      pending = null; stableCandidate = null;
      return mark('consumed', 'cloud_ask_owner');
    }
    const current = pending?.fingerprint || currentFingerprint(snapshot);
    if (!pending && current === lastFingerprint) return mark('deduped');
    if (!pending) {
      const now = Date.now();
      if (stableCandidate?.fingerprint !== current) {
        stableCandidate = { fingerprint: current, since: now };
        mark('stabilizing', 'first_snapshot'); schedule(850); return;
      }
      if (now - stableCandidate.since < 700) {
        mark('stabilizing', `${now - stableCandidate.since}ms`);
        schedule(700 - (now - stableCandidate.since)); return;
      }
      pending = { fingerprint: current, text, raw, snapshot, requestId: await stableRequestId(snapshot), attempts: 0 };
      stableCandidate = null;
    }

    const activeRequest = pending;
    if (!activeRequest) return;
    processing = true;
    const requestId = activeRequest.requestId;
    mark('captured', requestId);
    let retryDelay = 0;
    try {
      const result = await runtimeMessage({
        type: 'AURORA_RELAY_PROCESS', requestId, text: activeRequest.text, origin: origin(activeRequest.snapshot),
      });
      if (!result?.ok) { const error = new Error(result?.error || 'Aurora no procesó la captura.'); error.transient = result?.transient === true; throw error; }
      if (result.kind === 'disabled') { enabled = false; mark('off', 'server_disabled'); return; }
      if (result.kind === 'not_tool') {
        lastFingerprint = activeRequest.fingerprint; if (pending === activeRequest) pending = null; mark('idle', result.kind); return;
      }
      if (result.deliveryAcknowledged) {
        lastFingerprint = activeRequest.fingerprint; if (pending === activeRequest) pending = null; mark('delivered', `${requestId}:replay_ack`); return;
      }
      const deliveryPayload = result.delivery || { text: result.feedback || '', images: [], files: [] };
      if (!deliveryPayload.text && !deliveryPayload.images?.length && !deliveryPayload.files?.length) {
        throw new Error('JSON Family respondió sin contenido para entregar.');
      }
      mark('delivering', requestId);
      let delivery = await runtimeMessage({
        type: 'AURORA_RELAY_DELIVER', requestId,
        endpointId: root.dataset.auroraEndpointId || activeRequest.snapshot?.endpointId || null,
        delivery: deliveryPayload,
      });
      // El fallback mismo-frame solo maneja texto (relay-core.js hace
      // insertText+submit) — el feedback de tool SIEMPRE es texto, así que
      // cubre el caso real; imágenes/archivos en un frame sin tab quedan
      // fuera de alcance por ahora (no hay caso de uso conocido todavía).
      if (!delivery?.delivered && SIN_TAB_ERROR.test(delivery?.error || '')) {
        delivery = await sameFrameDeliver(deliveryPayload);
        // La entrega mismo-frame no pasa por deliverToOrigin (background), así
        // que el ACK server-side (evita reinyectar en un replay) hay que
        // pedirlo aparte.
        if (delivery?.delivered) runtimeMessage({ type: 'AURORA_RELAY_ACK', requestId }).catch(() => {});
      }
      if (!delivery?.delivered) { const error = new Error(delivery?.error || 'El proveedor no confirmó la entrega.'); error.transient = delivery?.transient === true; throw error; }
      lastFingerprint = activeRequest.fingerprint; if (pending === activeRequest) pending = null; mark('delivered', requestId);
    } catch (error) {
      if (!disposed && pending === activeRequest) {
        activeRequest.attempts = Number(activeRequest.attempts || 0) + 1;
        retryDelay = Math.min(30000, 1000 * (2 ** Math.min(activeRequest.attempts - 1, 5)));
      }
      if (error?.transient) {
        mark('waiting', 'runtime_channel_reconnecting');
      } else {
        mark('error', error?.message || String(error));
        console.warn('[Aurora Provider Relay]', error);
      }
    } finally {
      processing = false;
      if (retryDelay && enabled && !disposed && pending === activeRequest) schedule(retryDelay);
    }
  }

  function schedule(delay = null) {
    if (disposed) return;
    clearTimeout(timer);
    const wait = Number.isFinite(delay) ? Math.max(0, delay) : (lastSnapshot?.generating ? 1600 : 700);
    const scheduledAt = Date.now();
    timer = setTimeout(() => {
      const actualDelay = Date.now() - scheduledAt;
      // Delay real vs pedido: si la tab está oculta, Chrome throttlea setTimeout
      // (mínimo 1000ms, más agresivo con "Intensive throttling" tras minutos
      // ocultos). Si actualDelay >> wait, confirma throttling como causa del
      // cuelgue percibido al perder foco/minimizar.
      if (actualDelay > wait + 500) {
        relayLog('timer_throttled', `pedido=${wait}ms real=${actualDelay}ms`);
      }
      inspect();
    }, wait);
  }
  const onRuntimeMessage = (message, _sender, sendResponse) => {
    if (message?.type === 'AURORA_PROVIDER_RELAY_PING') {
      let runtimeAlive = false;
      try { runtimeAlive = Boolean(chrome.runtime?.id); } catch (_) {}
      sendResponse({
        ok: true,
        runtimeAlive,
        build: COURIER_BUILD,
        installedAt: globalThis.__auroraProviderRelayInstall?.installedAt,
      });
      return false;
    }
    if (message?.type !== 'JSON_FAMILY_STATE') return;
    enabled = !!message.enabled;
    mark(enabled ? 'armed' : 'off', 'state_push');
    if (enabled) schedule();
  };
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  domObserver = new MutationObserver(() => schedule());
  domObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  mark('booting');
  endpointHeartbeat('boot');
  endpointHeartbeatTimer = setInterval(() => endpointHeartbeat('heartbeat'), 5000);
  const onPageHide = () => {
    clearInterval(endpointHeartbeatTimer);
    try { chrome.runtime.sendMessage({ type: 'AURORA_ENDPOINT_RELEASE', reason: 'pagehide' }); } catch (_) {}
  };
  window.addEventListener('pagehide', onPageHide, { once: true });
  installation.dispose = reason => {
    disposed = true;
    enabled = false;
    pending = null;
    stableCandidate = null;
    processing = false;
    clearTimeout(timer);
    clearInterval(endpointHeartbeatTimer);
    try { domObserver?.disconnect(); } catch (_) {}
    try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch (_) {}
    try { window.removeEventListener('pagehide', onPageHide); } catch (_) {}
    if (globalThis.__auroraProviderRelayInstall === installation) {
      delete globalThis.__auroraProviderRelayInstall;
    }
    mark('disposed', reason || 'dispose');
  };
  runtimeMessage({ type: 'JSON_FAMILY_GET_STATE' }).then(state => {
    enabled = !!state?.enabled;
    mark(enabled ? 'armed' : 'off', state?.error || 'state_loaded');
    if (enabled) schedule();
  });
})();
