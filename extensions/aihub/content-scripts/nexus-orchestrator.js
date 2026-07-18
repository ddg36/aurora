// Nexus 2 Orchestrator (ISOLATED).
// Reutiliza únicamente snapshots y transporte de los Provider Drivers.
// No modifica ni depende del orquestador de JSON Family.
(function installNexusV2Orchestrator() {
  'use strict';

  const BUILD = '2026-07-18.5-managed-surface-delegation';
  const previous = globalThis.__auroraNexusV2Install;
  if (previous?.build === BUILD) return;
  try { previous?.dispose?.('upgrade'); } catch (_) {}

  const installation = globalThis.__auroraNexusV2Install = {
    build: BUILD,
    installedAt: Date.now(),
    dispose: null,
  };

  let enabled = false;
  let timer = null;
  let processing = false;
  let lastFingerprint = '';
  let stableCandidate = null;
  let pending = null;
  let lastSnapshot = null;
  let domObserver = null;
  let disposed = false;

  const mark = (phase, detail = '') => {
    const root = document.documentElement;
    if (!root) return;
    root.dataset.auroraNexusV2 = phase;
    root.dataset.auroraNexusV2Detail = String(detail || '').slice(0, 240);
  };

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

  const fingerprint = text => {
    let hash = 5381;
    for (const char of String(text || '')) hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
    return (hash >>> 0).toString(36);
  };

  const turnKey = snapshot => snapshot.turnId
    ? String(snapshot.turnId)
    : `${snapshot.conversation}:assistant-${Math.max(0, snapshot.turnIndex ?? 0)}`;

  const currentFingerprint = snapshot => `${turnKey(snapshot)}\n${fingerprint(snapshot.raw || snapshot.text)}`;

  const couldContainNexus = text => /(^|\n)\s*⬡/u.test(String(text || ''));

  async function stableRequestId(snapshot) {
    const material = `nexus-v2\n${snapshot.provider}\n${snapshot.adapter}\n${turnKey(snapshot)}\n${snapshot.raw || snapshot.text}`;
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
      const digest = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
      return `nexus-v2-${digest.slice(0, 32)}`;
    } catch (_) {
      return `nexus-v2-${fingerprint(material)}-${material.length}`;
    }
  }

  const origin = snapshot => ({
    relay: `nexus-orchestrator-${snapshot.adapter}-v2`,
    protocol: 'nexus-v2',
    adapter: snapshot.adapter,
    provider: snapshot.provider,
    surface: window === window.top ? 'tab' : 'iframe',
    conversation: snapshot.conversation,
    endpointId: document.documentElement?.dataset?.auroraEndpointId || null,
  });

  async function inspect() {
    timer = null;
    if (disposed || globalThis.__auroraNexusV2Install !== installation) return;
    if (!enabled) return mark('off');
    const root = document.documentElement;
    if (!root) return;
    if (processing || root.dataset.auroraCloudAskActive === '1') {
      return mark('waiting', processing ? 'nexus_processing' : 'cloud_ask_active');
    }

    const snapshotResult = await runtimeMessage({ type: 'AURORA_RELAY_SNAPSHOT' });
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
    root.dataset.auroraNexusV2Adapter = snapshot.adapter;

    // Los panes Cloud administrados por Aurora procesan Nexus dentro de su
    // propio loop durable (UI → backend → Pi → feedback → siguiente iteración).
    // Capturarlos también desde este courier produciría dos propietarios del
    // mismo turno: el loop UI podría cerrar con un fragmento mientras el courier
    // inyecta el resultado real y crea una respuesta huérfana en el proveedor.
    const managedSurface = snapshot.context?.surface === 'lyria-cloud';
    if (managedSurface) {
      pending = null;
      stableCandidate = null;
      lastFingerprint = currentFingerprint(snapshot);
      return mark('delegated', 'lyria_cloud_loop_owner');
    }

    if (snapshot.generating) return mark('waiting', 'provider_generating');

    const text = pending?.text || String(snapshot.raw || snapshot.text || '').trim();
    if (!text) {
      stableCandidate = null;
      return mark('idle', 'no_assistant');
    }

    // Detector barato. La validación estructural real vive en el backend.
    if (!pending && !couldContainNexus(text)) {
      lastFingerprint = currentFingerprint(snapshot);
      stableCandidate = null;
      return mark('idle', 'no_nexus_candidate');
    }

    const consumed = root.dataset.auroraNexusV2Consumed;
    const cloudConsumed = root.dataset.auroraJsonFamilyConsumed;
    const textHash = fingerprint(text);
    if ((consumed && consumed === textHash) || (cloudConsumed && cloudConsumed === textHash)) {
      lastFingerprint = currentFingerprint(snapshot);
      pending = null;
      stableCandidate = null;
      return mark('consumed', consumed === textHash ? 'nexus_cloud_owner' : 'cloud_ask_owner');
    }

    const current = pending?.fingerprint || currentFingerprint(snapshot);
    if (!pending && current === lastFingerprint) return mark('deduped');

    if (!pending) {
      const now = Date.now();
      if (stableCandidate?.fingerprint !== current) {
        stableCandidate = { fingerprint: current, since: now };
        mark('stabilizing', 'first_snapshot');
        schedule(850);
        return;
      }
      if (now - stableCandidate.since < 700) {
        mark('stabilizing', `${now - stableCandidate.since}ms`);
        schedule(700 - (now - stableCandidate.since));
        return;
      }
      pending = {
        fingerprint: current,
        text,
        snapshot,
        requestId: await stableRequestId(snapshot),
        attempts: 0,
      };
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
        type: 'AURORA_NEXUS_PROCESS',
        requestId,
        text: activeRequest.text,
        origin: origin(activeRequest.snapshot),
      });
      if (!result?.ok) { const error = new Error(result?.error || 'Aurora no procesó la captura Nexus.'); error.transient = result?.transient === true; throw error; }
      if (result.kind === 'disabled') {
        enabled = false;
        mark('off', 'server_disabled');
        return;
      }
      if (result.kind === 'not_tool') {
        lastFingerprint = activeRequest.fingerprint;
        if (pending === activeRequest) pending = null;
        mark('idle', result.kind);
        return;
      }
      if (result.deliveryAcknowledged) {
        lastFingerprint = activeRequest.fingerprint;
        if (pending === activeRequest) pending = null;
        mark('delivered', `${requestId}:replay_ack`);
        return;
      }

      const deliveryPayload = result.delivery || {
        text: result.feedback || '', images: [], files: [],
      };
      if (!deliveryPayload.text && !deliveryPayload.images?.length && !deliveryPayload.files?.length) {
        throw new Error('Nexus 2 respondió sin contenido para entregar.');
      }

      mark('delivering', requestId);
      const delivery = await runtimeMessage({
        type: 'AURORA_NEXUS_DELIVER',
        requestId,
        endpointId: root.dataset.auroraEndpointId || activeRequest.snapshot?.endpointId || null,
        delivery: deliveryPayload,
      });
      if (!delivery?.delivered) { const error = new Error(delivery?.error || 'El proveedor no confirmó la entrega Nexus.'); error.transient = delivery?.transient === true; throw error; }

      lastFingerprint = activeRequest.fingerprint;
      if (pending === activeRequest) pending = null;
      mark('delivered', requestId);
    } catch (error) {
      if (!disposed && pending === activeRequest) {
        activeRequest.attempts = Number(activeRequest.attempts || 0) + 1;
        retryDelay = Math.min(30000, 1000 * (2 ** Math.min(activeRequest.attempts - 1, 5)));
      }
      if (error?.transient) {
        mark('waiting', 'runtime_channel_reconnecting');
      } else {
        mark('error', error?.message || String(error));
        console.warn('[Aurora Nexus 2 Orchestrator]', error);
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
    timer = setTimeout(inspect, wait);
  }

  const onRuntimeMessage = (message, _sender, sendResponse) => {
    if (message?.type === 'AURORA_NEXUS_PING') {
      let runtimeAlive = false;
      try { runtimeAlive = Boolean(chrome.runtime?.id); } catch (_) {}
      sendResponse({
        ok: true,
        runtimeAlive,
        build: BUILD,
        installedAt: globalThis.__auroraNexusV2Install?.installedAt,
      });
      return false;
    }
    if (message?.type !== 'NEXUS_V2_STATE') return;
    enabled = !!message.enabled;
    mark(enabled ? 'armed' : 'off', 'state_push');
    if (enabled) schedule();
  };

  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  domObserver = new MutationObserver(() => schedule());
  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  mark('booting');
  installation.dispose = reason => {
    disposed = true;
    enabled = false;
    pending = null;
    stableCandidate = null;
    processing = false;
    clearTimeout(timer);
    try { domObserver?.disconnect(); } catch (_) {}
    try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch (_) {}
    if (globalThis.__auroraNexusV2Install === installation) delete globalThis.__auroraNexusV2Install;
    mark('disposed', reason || 'dispose');
  };

  runtimeMessage({ type: 'NEXUS_V2_GET_STATE' }).then(state => {
    enabled = !!state?.enabled;
    mark(enabled ? 'armed' : 'off', state?.error || 'state_loaded');
    if (enabled) schedule();
  });
})();
