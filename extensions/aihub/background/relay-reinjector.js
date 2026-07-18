// Relay Reinjector — recupera couriers después de recargar la extensión sin
// navegar, recargar ni detener la página del proveedor.
(() => {
  'use strict';
  const COURIER_BUILD = '2026-07-18.4-channel-recovery';
  const BASE_MAIN = [
    'content-scripts/relay/relay-contract.js',
    'content-scripts/relay/relay-utils.js',
  ];
  const CORE_MAIN = [
    'content-scripts/relay/relay-core.js',
    'content-scripts/cloud-relay.js',
  ];
  const COURIER = ['content-scripts/provider-relay.js'];
  const PROVIDERS = Object.freeze({
    'chatgpt.com': 'content-scripts/relay/providers/relay-chatgpt.js',
    'chat.openai.com': 'content-scripts/relay/providers/relay-chatgpt.js',
    'gemini.google.com': 'content-scripts/relay/providers/relay-gemini.js',
    'claude.ai': 'content-scripts/relay/providers/relay-generic.js',
    'grok.com': 'content-scripts/relay/providers/relay-generic.js',
    'perplexity.ai': 'content-scripts/relay/providers/relay-generic.js',
    'www.perplexity.ai': 'content-scripts/relay/providers/relay-generic.js',
    'copilot.microsoft.com': 'content-scripts/relay/providers/relay-generic.js',
    'kimi.moonshot.cn': 'content-scripts/relay/providers/relay-generic.js',
    'poe.com': 'content-scripts/relay/providers/relay-generic.js',
    'you.com': 'content-scripts/relay/providers/relay-generic.js',
    'chat.qwen.ai': 'content-scripts/relay/providers/relay-generic.js',
  });
  let scanPromise = null;
  let scheduledScan = null;

  function withTimeout(promise, timeoutMs, fallback = null) {
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(value);
      };
      const timer = setTimeout(() => finish(fallback), timeoutMs);
      Promise.resolve(promise).then(finish, () => finish(fallback));
    });
  }

  function hostname(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch (_) { return ''; }
  }

  async function ping(tabId, frameId) {
    try {
      const response = await withTimeout(chrome.tabs.sendMessage(tabId, {
        type: 'AURORA_PROVIDER_RELAY_PING', expectedBuild: COURIER_BUILD,
      }, { frameId }), 1200, null);
      return response?.ok ? response : null;
    } catch (_) { return null; }
  }

  async function probeMain(tabId, frameId) {
    try {
      const result = await withTimeout(chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] }, world: 'MAIN',
        func: () => {
          const adapter = globalThis.__auroraRelayV2?.findProvider?.(location);
          const observe = adapter?.observe;
          let composerReady = false, generating = false;
          try { composerReady = !!observe?.getInput?.(); } catch (_) {}
          try { generating = !!observe?.isGenerating?.(); } catch (_) {}
          let context = null;
          try { context = globalThis.__auroraRelaySurfaceContext?.() || null; } catch (_) {}
          return {
            ready: !!(adapter && globalThis.__auroraRelayInstance),
            adapter: adapter?.id || null, composerReady, generating, context,
          };
        },
      }), 2500, null);
      if (!result) return { ready: false, error: 'probe_timeout' };
      return result?.[0]?.result || { ready: false };
    } catch (error) {
      return { ready: false, error: error?.message || String(error) };
    }
  }

  async function injectFiles(tabId, frameId, files, world) {
    const timeout = Symbol('inject_timeout');
    const result = await withTimeout(chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] }, world, files,
    }), 4500, timeout);
    if (result === timeout) throw new Error(`inject_timeout:${world.toLowerCase()}`);
  }

  async function ensureProviderMain(tab, frame, reason = 'provider_main') {
    const tabId = tab.id;
    const frameId = Number(frame.frameId || 0);
    const host = hostname(frame.url || tab.url);
    const providerFile = PROVIDERS[host];
    if (!providerFile) return { ok: true, state: 'unsupported', tabId, frameId, host };
    if (tab.discarded) return { ok: true, state: 'deferred_discarded', tabId, frameId, host };
    if (tab.frozen) return { ok: true, state: 'deferred_frozen', tabId, frameId, host };

    let main = await probeMain(tabId, frameId);
    let mainInjected = false;
    if (!main.ready) {
      await injectFiles(tabId, frameId, [...BASE_MAIN, providerFile, ...CORE_MAIN], 'MAIN');
      mainInjected = true;
      main = await probeMain(tabId, frameId);
    }
    if (!main.ready) {
      return { ok: false, state: 'main_unavailable', tabId, frameId, host, error: main.error || null };
    }
    return { ok: true, state: 'main_ready', tabId, frameId, host, reason, mainInjected, main };
  }

  async function resetCourier(tabId, frameId) {
    await withTimeout(chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] }, world: 'ISOLATED',
      func: () => {
        try { globalThis.__auroraProviderRelayInstall?.dispose?.('extension_reconnect'); } catch (_) {}
        try { delete globalThis.__auroraProviderRelayInstall; } catch (_) {}
      },
    }), 2500, null);
  }

  async function ensureFrame(tab, frame, reason = 'scan') {
    const tabId = tab.id;
    const frameId = Number(frame.frameId || 0);
    const host = hostname(frame.url || tab.url);
    const providerFile = PROVIDERS[host];
    if (!providerFile) return { ok: true, state: 'unsupported', tabId, frameId, host };
    if (tab.discarded) return { ok: true, state: 'deferred_discarded', tabId, frameId, host };
    if (tab.frozen) return { ok: true, state: 'deferred_frozen', tabId, frameId, host };

    const alive = await ping(tabId, frameId);
    if (alive?.build === COURIER_BUILD && alive.runtimeAlive === true) {
      return { ok: true, state: 'alive', tabId, frameId, host, build: alive.build };
    }

    let main = await probeMain(tabId, frameId);
    let mainInjected = false;
    if (!main.ready) {
      await injectFiles(tabId, frameId, [...BASE_MAIN, providerFile, ...CORE_MAIN], 'MAIN');
      mainInjected = true;
      main = await probeMain(tabId, frameId);
    }
    if (!main.ready) return { ok: false, state: 'main_unavailable', tabId, frameId, host, error: main.error || null };

    const bound = !!main.context?.channelId || main.context?.mode === 'top-level';
    if (frameId !== 0 && !bound && !main.composerReady) {
      return { ok: true, state: 'ignored', tabId, frameId, host, reason: 'non_conversational_frame' };
    }

    // Tras chrome.runtime.reload() un listener viejo puede seguir contestando
    // tabs.sendMessage aunque sus llamadas a runtime fallen con
    // "Extension context invalidated". Desmontarlo explícitamente antes de
    // inyectar evita que el guard de build confunda ese zombie con uno sano.
    await resetCourier(tabId, frameId);
    await injectFiles(tabId, frameId, COURIER, 'ISOLATED');
    const restored = await ping(tabId, frameId);
    return {
      ok: !!restored && restored.build === COURIER_BUILD && restored.runtimeAlive === true,
      state: restored?.build === COURIER_BUILD && restored.runtimeAlive === true ? (alive ? 'upgraded' : 'reconnected') : 'courier_unavailable',
      tabId, frameId, host, reason, mainInjected,
      generating: !!main.generating, context: main.context || null,
      build: restored?.build || null,
    };
  }

  async function scan(reason = 'manual') {
    if (scanPromise) return scanPromise;
    scanPromise = (async () => {
      const jobs = [];
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!Number.isInteger(tab.id)) continue;
        let frames = [];
        try { frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }) || []; } catch (_) {}
        if (!frames.length && PROVIDERS[hostname(tab.url)]) frames = [{ frameId: 0, url: tab.url }];
        for (const frame of frames) {
          if (!PROVIDERS[hostname(frame.url || tab.url)]) continue;
          jobs.push((async () => {
            try {
              return await withTimeout(
                ensureFrame(tab, frame, reason), 9000,
                { ok: true, state: 'deferred_timeout', tabId: tab.id, frameId: Number(frame.frameId || 0) },
              );
            } catch (error) {
              return { ok: false, state: 'error', tabId: tab.id, frameId: Number(frame.frameId || 0), error: error?.message || String(error) };
            }
          })());
        }
      }
      const reports = await Promise.all(jobs);
      return { ok: reports.every(item => item.ok), reason, reports };
    })();
    try { return await scanPromise; } finally { scanPromise = null; }
  }

  function scheduleScan(reason) {
    clearTimeout(scheduledScan);
    scheduledScan = setTimeout(() => {
      scheduledScan = null;
      scan(reason).catch(() => {});
    }, 300);
  }

  chrome.tabs.onActivated?.addListener?.(() => scheduleScan('tab_activated'));
  chrome.tabs.onUpdated?.addListener?.((_tabId, changeInfo) => {
    if (changeInfo.frozen === false || changeInfo.discarded === false || changeInfo.status === 'complete') {
      scheduleScan('tab_resumed');
    }
  });

  globalThis.AuroraRelayReinjector = Object.freeze({ scan, ensureFrame, ensureProviderMain, ping, probeMain, scheduleScan });
})();
