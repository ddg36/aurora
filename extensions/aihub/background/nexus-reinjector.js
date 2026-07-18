// Nexus 2 Reinjector — recupera únicamente el orquestador Nexus aislado.
// Los Provider Drivers y Relay Core siguen siendo propiedad del relay existente.
(() => {
  'use strict';

  const BUILD = '2026-07-18.4-nexus-channel-recovery';
  const COURIER = ['content-scripts/nexus-orchestrator.js'];
  const HOSTS = new Set([
    'chatgpt.com', 'chat.openai.com', 'gemini.google.com', 'claude.ai', 'grok.com',
    'perplexity.ai', 'www.perplexity.ai', 'copilot.microsoft.com', 'kimi.moonshot.cn',
    'poe.com', 'you.com', 'chat.qwen.ai',
  ]);

  let scanPromise = null;
  let scheduledScan = null;

  const withTimeout = (promise, timeoutMs, fallback = null) => new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(fallback), timeoutMs);
    Promise.resolve(promise).then(finish, () => finish(fallback));
  });

  const hostname = url => {
    try { return new URL(url).hostname.toLowerCase(); } catch (_) { return ''; }
  };

  async function ping(tabId, frameId) {
    try {
      const response = await withTimeout(chrome.tabs.sendMessage(tabId, {
        type: 'AURORA_NEXUS_PING', expectedBuild: BUILD,
      }, { frameId }), 1200, null);
      return response?.ok ? response : null;
    } catch (_) {
      return null;
    }
  }

  async function reset(tabId, frameId) {
    await withTimeout(chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: 'ISOLATED',
      func: () => {
        try { globalThis.__auroraNexusV2Install?.dispose?.('extension_reconnect'); } catch (_) {}
        try { delete globalThis.__auroraNexusV2Install; } catch (_) {}
      },
    }), 2500, null);
  }

  async function inject(tabId, frameId) {
    await withTimeout(chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: 'ISOLATED',
      files: COURIER,
    }), 4500, null);
  }

  async function ensureFrame(tab, frame, reason = 'scan') {
    const tabId = tab.id;
    const frameId = Number(frame.frameId || 0);
    const host = hostname(frame.url || tab.url);
    if (!HOSTS.has(host)) return { ok: true, state: 'unsupported', tabId, frameId, host };
    if (tab.discarded) return { ok: true, state: 'deferred_discarded', tabId, frameId, host };
    if (tab.frozen) return { ok: true, state: 'deferred_frozen', tabId, frameId, host };

    // Reutiliza solamente el bootstrap MAIN neutral. La salud o presencia del
    // courier JSON no participa en la disponibilidad de Nexus.
    const provider = await globalThis.AuroraRelayReinjector?.ensureProviderMain?.(tab, frame, `nexus:${reason}`);
    if (!provider) {
      return { ok: false, state: 'provider_bootstrap_missing', tabId, frameId, host };
    }
    if (provider.ok === false) {
      return { ok: false, state: 'provider_unavailable', tabId, frameId, host, error: provider.error || null };
    }
    if (['unsupported', 'deferred_discarded', 'deferred_frozen'].includes(provider.state)) {
      return { ...provider };
    }
    const main = provider.main || {};
    const bound = !!main.context?.channelId || main.context?.mode === 'top-level';
    if (frameId !== 0 && !bound && !main.composerReady) {
      return { ok: true, state: 'ignored', tabId, frameId, host, reason: 'non_conversational_frame' };
    }

    const alive = await ping(tabId, frameId);
    if (alive?.build === BUILD && alive.runtimeAlive === true) {
      return { ok: true, state: 'alive', tabId, frameId, host, build: alive.build };
    }

    await reset(tabId, frameId);
    await inject(tabId, frameId);
    const restored = await ping(tabId, frameId);
    return {
      ok: !!restored && restored.build === BUILD && restored.runtimeAlive === true,
      state: restored?.build === BUILD && restored.runtimeAlive === true
        ? (alive ? 'upgraded' : 'reconnected')
        : 'nexus_orchestrator_unavailable',
      tabId, frameId, host, reason, build: restored?.build || null,
    };
  }

  async function scan(reason = 'manual') {
    if (scanPromise) return scanPromise;
    scanPromise = (async () => {
      const tabs = await chrome.tabs.query({});
      const jobs = [];
      for (const tab of tabs) {
        if (!Number.isInteger(tab.id)) continue;
        let frames = [];
        try { frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }) || []; } catch (_) {}
        if (!frames.length && HOSTS.has(hostname(tab.url))) frames = [{ frameId: 0, url: tab.url }];
        for (const frame of frames) {
          if (!HOSTS.has(hostname(frame.url || tab.url))) continue;
          jobs.push(ensureFrame(tab, frame, reason).catch(error => ({
            ok: false,
            state: 'error',
            tabId: tab.id,
            frameId: Number(frame.frameId || 0),
            error: error?.message || String(error),
          })));
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
    }, 450);
  }

  chrome.tabs.onActivated?.addListener?.(() => scheduleScan('tab_activated'));
  chrome.tabs.onUpdated?.addListener?.((_tabId, changeInfo) => {
    if (changeInfo.frozen === false || changeInfo.discarded === false || changeInfo.status === 'complete') {
      scheduleScan('tab_resumed');
    }
  });

  globalThis.AuroraNexusV2Reinjector = Object.freeze({ scan, ensureFrame, ping, scheduleScan });
})();
