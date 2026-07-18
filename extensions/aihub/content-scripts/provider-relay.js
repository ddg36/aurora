// Courier isolated de Relay Family. No conoce el DOM ni ejecuta tools:
// pide una foto semántica al Provider Driver MAIN y habla con JSON Family.
(function installProviderRelay() {
  'use strict';
  const COURIER_BUILD = '2026-07-17.2-endpoint-routing';
  const previousInstall = globalThis.__auroraProviderRelayInstall;
  if (previousInstall?.build === COURIER_BUILD) return;
  try { previousInstall?.dispose?.('upgrade'); } catch (_) {}
  const installation = globalThis.__auroraProviderRelayInstall = {
    build: COURIER_BUILD, installedAt: Date.now(), dispose: null,
  };
  let enabled = false, timer = null, processing = false;
  let lastFingerprint = '', stableCandidate = null, pending = null, lastSnapshot = null;
  let endpointHeartbeatTimer = null, domObserver = null;

  const mark = (phase, detail = '') => {
    document.documentElement.dataset.auroraProviderRelay = phase;
    document.documentElement.dataset.auroraProviderRelayDetail = String(detail || '').slice(0, 240);
  };
  const runtimeMessage = payload => new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(payload, response => {
        const error = chrome.runtime.lastError;
        resolve(error ? { ok: false, error: error.message } : response);
      });
    } catch (error) { resolve({ ok: false, error: error?.message || String(error) }); }
  });
  let heartbeatBusy = false;
  async function endpointHeartbeat(phase = 'heartbeat') {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      const result = await runtimeMessage({ type: 'AURORA_ENDPOINT_HEARTBEAT', phase });
      const endpoint = result?.endpoint;
      document.documentElement.dataset.auroraEndpointRegistry = result?.ok
        ? (endpoint?.ignored ? 'ignored' : 'registered') : 'error';
      document.documentElement.dataset.auroraEndpointRegistryDetail = result?.ok
        ? (endpoint?.ignored ? endpoint.reason : `${endpoint?.endpointId || 'unknown'}:${endpoint?.state || 'unknown'}`)
        : String(result?.error || 'heartbeat_failed').slice(0, 240);
      if (endpoint?.endpointId) document.documentElement.dataset.auroraEndpointId = endpoint.endpointId;
      else delete document.documentElement.dataset.auroraEndpointId;
    } finally { heartbeatBusy = false; }
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
    endpointId: document.documentElement.dataset.auroraEndpointId || null,
  });

  async function inspect() {
    timer = null;
    if (!enabled) return mark('off');
    if (processing || document.documentElement.dataset.auroraCloudAskActive === '1') {
      return mark('waiting', processing ? 'aurora_processing' : 'cloud_ask_active');
    }
    const snapshotResult = await runtimeMessage({ type: 'AURORA_RELAY_SNAPSHOT' });
    if (!snapshotResult?.ok) {
      mark('error', snapshotResult?.error || 'provider_snapshot_failed');
      return schedule(1600);
    }
    const snapshot = snapshotResult.snapshot;
    lastSnapshot = snapshot;
    document.documentElement.dataset.auroraProviderRelayAdapter = snapshot.adapter;
    if (snapshot.generating) return mark('waiting', 'provider_generating');

    const text = pending?.text || String(snapshot.text || '').trim();
    if (!text) { stableCandidate = null; return mark('idle', 'no_assistant'); }
    const raw = pending?.raw || String(snapshot.raw || text).trim();
    const consumed = document.documentElement.dataset.auroraJsonFamilyConsumed;
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

    processing = true;
    const requestId = pending.requestId;
    mark('captured', requestId);
    let retryDelay = 0;
    try {
      const result = await runtimeMessage({
        type: 'AURORA_RELAY_PROCESS', requestId, text: pending.text, origin: origin(pending.snapshot),
      });
      if (!result?.ok) throw new Error(result?.error || 'Aurora no procesó la captura.');
      if (result.kind === 'disabled') { enabled = false; mark('off', 'server_disabled'); return; }
      if (result.kind === 'not_tool') {
        lastFingerprint = pending.fingerprint; pending = null; mark('idle', result.kind); return;
      }
      if (result.deliveryAcknowledged) {
        lastFingerprint = pending.fingerprint; pending = null; mark('delivered', `${requestId}:replay_ack`); return;
      }
      const deliveryPayload = result.delivery || { text: result.feedback || '', images: [], files: [] };
      if (!deliveryPayload.text && !deliveryPayload.images?.length && !deliveryPayload.files?.length) {
        throw new Error('JSON Family respondió sin contenido para entregar.');
      }
      mark('delivering', requestId);
      const delivery = await runtimeMessage({
        type: 'AURORA_RELAY_DELIVER', requestId,
        endpointId: document.documentElement.dataset.auroraEndpointId || pending.snapshot?.endpointId || null,
        delivery: deliveryPayload,
      });
      if (!delivery?.delivered) throw new Error(delivery?.error || 'El proveedor no confirmó la entrega.');
      lastFingerprint = pending.fingerprint; pending = null; mark('delivered', requestId);
    } catch (error) {
      pending.attempts += 1;
      retryDelay = Math.min(30000, 1000 * (2 ** Math.min(pending.attempts - 1, 5)));
      mark('error', error?.message || String(error));
      console.warn('[Aurora Provider Relay]', error);
    } finally {
      processing = false;
      if (retryDelay && enabled) schedule(retryDelay);
    }
  }

  function schedule(delay = null) {
    clearTimeout(timer);
    timer = setTimeout(inspect, delay ?? (lastSnapshot?.generating ? 1600 : 700));
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
  domObserver = new MutationObserver(schedule);
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
    enabled = false;
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
