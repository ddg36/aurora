// Endpoint Registry — identidad lógica Surface Context + identidad física Chrome.
// No conoce DOM ni providers; recibe snapshots semánticos desde background.js.
(() => {
  'use strict';
  const STORAGE_KEY = 'aurora:endpoint_registry_v1';
  const HEARTBEAT_TTL_MS = 20000;
  const endpoints = new Map();
  const tabProtection = new Map();
  let loaded = false;
  let queue = Promise.resolve();

  async function load() {
    if (loaded) return;
    let stored = null;
    try { stored = (await chrome.storage.session.get([STORAGE_KEY]))[STORAGE_KEY]; } catch (_) {}
    for (const endpoint of stored?.endpoints || []) if (endpoint?.endpointId) endpoints.set(endpoint.endpointId, endpoint);
    for (const protection of stored?.tabProtection || []) {
      if (Number.isInteger(protection?.tabId)) tabProtection.set(protection.tabId, protection);
    }
    loaded = true;
  }

  async function save() {
    const snapshot = {
      version: 1, updatedAt: Date.now(),
      endpoints: [...endpoints.values()], tabProtection: [...tabProtection.values()],
    };
    try { await chrome.storage.session.set({ [STORAGE_KEY]: snapshot }); } catch (_) {}
    return snapshot;
  }

  function run(task) {
    const execute = async () => { await load(); return task(); };
    queue = queue.then(execute, execute);
    return queue;
  }

  const physicalKey = (tabId, frameId) => `${tabId}:${frameId}`;
  const logicalId = (sender, snapshot) => String(snapshot?.context?.channelId || `tab:${sender.tab?.id}:${Number(sender.frameId || 0)}`);
  const unavailableStates = new Set(['offline', 'discarded', 'frozen']);

  async function protectTab(tab) {
    if (!tab?.id && tab?.id !== 0) return;
    if (!tabProtection.has(tab.id)) tabProtection.set(tab.id, {
      tabId: tab.id,
      originalAutoDiscardable: tab.autoDiscardable !== false,
      protectedAt: Date.now(),
    });
    if (tab.autoDiscardable !== false) {
      try { await chrome.tabs.update(tab.id, { autoDiscardable: false }); } catch (_) {}
    }
  }

  async function restoreTabIfUnused(tabId) {
    const active = [...endpoints.values()].some(endpoint =>
      endpoint.tabId === tabId && endpoint.state !== 'offline'
      && Date.now() - Number(endpoint.lastHeartbeat || 0) <= HEARTBEAT_TTL_MS);
    if (active) return false;
    const protection = tabProtection.get(tabId);
    if (!protection) return false;
    try { await chrome.tabs.update(tabId, { autoDiscardable: protection.originalAutoDiscardable !== false }); } catch (_) {}
    tabProtection.delete(tabId);
    return true;
  }

  async function cleanup() {
    const now = Date.now();
    const tabsToRestore = new Set();
    for (const [id, endpoint] of endpoints) {
      if (endpoint.state !== 'offline' && now - Number(endpoint.lastHeartbeat || 0) > HEARTBEAT_TTL_MS) {
        endpoints.set(id, { ...endpoint, state: 'offline', offlineReason: 'heartbeat_timeout', updatedAt: now });
        tabsToRestore.add(endpoint.tabId);
      }
    }
    for (const tabId of tabsToRestore) await restoreTabIfUnused(tabId);
  }

  function heartbeat(sender, snapshot, phase = 'heartbeat') {
    const frameId = Number(sender.frameId || 0);
    const context = snapshot?.context || {};
    const unboundEmbeddedFrame = frameId !== 0
      && context.mode !== 'top-level'
      && !context.channelId
      && !snapshot?.composerReady;
    if (unboundEmbeddedFrame) {
      return release(sender, 'non_conversational_frame').then(() => ({
        ignored: true, reason: 'embedded_without_binding_or_composer',
        physicalKey: physicalKey(sender.tab?.id, frameId),
      }));
    }
    return run(async () => {
      await cleanup();
      if (!sender.tab?.id && sender.tab?.id !== 0) throw new Error('Endpoint sin tab de origen.');
      const tab = await chrome.tabs.get(sender.tab.id);
      const endpointId = logicalId(sender, snapshot);
      const previous = endpoints.get(endpointId) || {};
      const state = tab.discarded ? 'discarded' : tab.frozen ? 'frozen' : (snapshot.state || 'idle');
      const endpoint = {
        ...previous,
        endpointId, physicalKey: physicalKey(tab.id, frameId),
        windowId: tab.windowId, tabId: tab.id, frameId,
        providerId: snapshot.adapter, providerVersion: snapshot.version,
        conversationKey: snapshot.conversation, capabilities: snapshot.capabilities || {},
        surface: snapshot.context?.surface || (frameId === 0 ? 'tab' : 'embedded-unknown'),
        surfaceInstanceId: snapshot.context?.surfaceInstanceId || null,
        paneId: snapshot.context?.paneId || null,
        channelId: snapshot.context?.channelId || null,
        role: snapshot.context?.role || null, runId: snapshot.context?.runId || null,
        mode: snapshot.context?.mode || (frameId === 0 ? 'top-level' : 'embedded'),
        composerReady: !!snapshot.composerReady,
        state, phase, discarded: !!tab.discarded, frozen: !!tab.frozen,
        autoDiscardable: false, lastHeartbeat: Date.now(), updatedAt: Date.now(), offlineReason: null,
      };
      for (const [id, candidate] of endpoints) {
        if (id !== endpointId && candidate.physicalKey === endpoint.physicalKey && candidate.state !== 'offline') {
          endpoints.set(id, { ...candidate, state: 'offline', offlineReason: 'rebound', updatedAt: Date.now() });
        }
      }
      endpoints.set(endpointId, endpoint);
      await protectTab(tab);
      // Un endpoint lógico puede sobrevivir a un reload y reaparecer en otro
      // frame/tab. Su ruta nueva gana, pero la protección de la ruta anterior
      // también debe liberarse; de lo contrario cada rebind deja tabs
      // autoDiscardable:false para siempre.
      if (previous.tabId !== undefined && previous.tabId !== tab.id) {
        await restoreTabIfUnused(previous.tabId);
      }
      await save();
      return endpoint;
    });
  }

  function release(sender, reason = 'pagehide') {
    return run(async () => {
      const tabId = sender.tab?.id;
      const frameId = Number(sender.frameId || 0);
      const key = physicalKey(tabId, frameId);
      const now = Date.now();
      for (const [id, endpoint] of endpoints) {
        if (endpoint.physicalKey === key && endpoint.state !== 'offline') {
          endpoints.set(id, { ...endpoint, state: 'offline', offlineReason: reason, updatedAt: now });
        }
      }
      await restoreTabIfUnused(tabId);
      await save();
      return true;
    });
  }

  function list() {
    return run(async () => {
      await cleanup(); await save();
      return [...endpoints.values()].sort((a, b) => Number(b.lastHeartbeat || 0) - Number(a.lastHeartbeat || 0));
    });
  }

  function resolve(target) {
    return run(async () => {
      await cleanup();
      const query = typeof target === 'string' ? { endpointId: target } : (target || {});
      const requireComposer = query.requireComposer !== false;
      const keys = [
        'endpointId', 'channelId', 'surface', 'surfaceInstanceId', 'paneId',
        'providerId', 'role', 'runId', 'tabId', 'frameId',
      ];
      const candidates = [...endpoints.values()].filter(endpoint => {
        if (unavailableStates.has(endpoint.state)) return false;
        if (Date.now() - Number(endpoint.lastHeartbeat || 0) > HEARTBEAT_TTL_MS) return false;
        if (requireComposer && !endpoint.composerReady) return false;
        return keys.every(key => query[key] === undefined || query[key] === null || endpoint[key] === query[key]);
      });
      if (!candidates.length) throw new Error(`Endpoint no disponible: ${query.endpointId || query.channelId || 'consulta sin coincidencias'}`);
      if (candidates.length > 1) throw new Error(`Destino ambiguo: ${candidates.length} endpoints coinciden; usa endpointId.`);
      return { ...candidates[0] };
    });
  }

  function updateTabState(tabId, changeInfo) {
    return run(async () => {
      const now = Date.now();
      for (const [id, endpoint] of endpoints) {
        if (endpoint.tabId !== tabId) continue;
        const discarded = 'discarded' in changeInfo ? !!changeInfo.discarded : !!endpoint.discarded;
        const frozen = 'frozen' in changeInfo ? !!changeInfo.frozen : !!endpoint.frozen;
        const state = discarded ? 'discarded' : frozen ? 'frozen'
          : (endpoint.state === 'discarded' || endpoint.state === 'frozen' ? 'booting' : endpoint.state);
        endpoints.set(id, { ...endpoint, discarded, frozen, state, updatedAt: now });
      }
      await save();
    });
  }

  function removeTab(tabId) {
    return run(async () => {
      const now = Date.now();
      for (const [id, endpoint] of endpoints) if (endpoint.tabId === tabId) endpoints.set(id, {
        ...endpoint, state: 'offline', offlineReason: 'tab_removed', updatedAt: now,
      });
      tabProtection.delete(tabId);
      await save();
    });
  }

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if ('discarded' in changeInfo || 'frozen' in changeInfo || 'status' in changeInfo) updateTabState(tabId, changeInfo).catch(() => {});
  });
  chrome.tabs.onRemoved.addListener(tabId => removeTab(tabId).catch(() => {}));

  globalThis.AuroraEndpointRegistry = Object.freeze({ heartbeat, release, list, resolve });
})();
