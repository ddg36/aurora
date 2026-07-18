import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOAD_COUNT = Math.max(10, Number.parseInt(process.env.AURORA_RELAY_LOAD_COUNT || '100', 10) || 100);
const source = fs.readFileSync(path.join(root, 'extensions/aihub/background/endpoint-registry.js'), 'utf8');
const sessionStore = {};
const updates = [];
const tabListeners = { updated: null, removed: null };
const tabs = new Map([
  [10, { id: 10, windowId: 2, autoDiscardable: true, discarded: false, frozen: false }],
  [20, { id: 20, windowId: 3, autoDiscardable: true, discarded: false, frozen: false }],
  ...Array.from({ length: LOAD_COUNT + 1 }, (_, index) => {
    const id = 30 + index;
    return [id, { id, windowId: 4, autoDiscardable: true, discarded: false, frozen: false }];
  }),
]);
const chrome = {
  storage: { session: {
    async get(keys) { return Object.fromEntries(keys.map(key => [key, sessionStore[key]])); },
    async set(values) { Object.assign(sessionStore, values); },
  } },
  tabs: {
    async get(id) { return { ...tabs.get(id) }; },
    async update(id, patch) { updates.push({ id, patch }); Object.assign(tabs.get(id), patch); return { ...tabs.get(id) }; },
    onUpdated: { addListener(fn) { tabListeners.updated = fn; } },
    onRemoved: { addListener(fn) { tabListeners.removed = fn; } },
  },
};
const context = vm.createContext({ chrome, globalThis: null, Date, Map, Set, Object, String, Number, Promise });
context.globalThis = context;
vm.runInContext(source, context, { filename: 'endpoint-registry.js' });
const registry = context.AuroraEndpointRegistry;

const snapshot = (paneId, overrides = {}) => ({
  adapter: 'chatgpt', version: 2, conversation: 'https://chatgpt.com/c/test',
  capabilities: { text: true }, composerReady: true, state: 'idle',
  context: {
    surface: 'llmcloud', surfaceInstanceId: 'surface-a', paneId,
    channelId: `surface-a:${paneId}`, mode: 'embedded', role: null, runId: null,
  },
  ...overrides,
});

const left = await registry.heartbeat({ tab: { id: 10 }, frameId: 4 }, snapshot('agent-1'), 'test');
const right = await registry.heartbeat({ tab: { id: 10 }, frameId: 5 }, snapshot('agent-2'), 'test');
assert.equal(left.endpointId, 'surface-a:agent-1');
assert.equal(right.physicalKey, '10:5');
assert.equal(left.surface, 'llmcloud');
assert.equal(tabs.get(10).autoDiscardable, false);
assert.equal(updates.filter(item => item.id === 10 && item.patch.autoDiscardable === false).length, 1);

const nested = await registry.heartbeat({ tab: { id: 10 }, frameId: 99 }, {
  ...snapshot(null), composerReady: false,
  context: { surface: 'embedded-unknown', mode: 'embedded' },
}, 'test');
assert.equal(nested.ignored, true, 'subframes internos sin binding/composer no son endpoints');
assert.equal((await registry.list()).some(item => item.physicalKey === '10:99'), false);

await registry.release({ tab: { id: 10 }, frameId: 4 }, 'test_release');
assert.equal(tabs.get(10).autoDiscardable, false, 'otro endpoint mantiene protegida la tab');
await registry.release({ tab: { id: 10 }, frameId: 5 }, 'test_release');
assert.equal(tabs.get(10).autoDiscardable, true, 'último release restaura estado original');

const normal = await registry.heartbeat({ tab: { id: 20 }, frameId: 0 }, {
  ...snapshot(null), context: { surface: 'tab', mode: 'top-level' },
}, 'test');
assert.equal(normal.endpointId, 'tab:20:0');
assert.equal(normal.surface, 'tab');
tabListeners.updated(20, { frozen: true });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal((await registry.list()).find(item => item.endpointId === 'tab:20:0').state, 'frozen');
tabListeners.updated(20, { frozen: false, discarded: true });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal((await registry.list()).find(item => item.endpointId === 'tab:20:0').state, 'discarded');

// Carga multiagente: 100 sesiones por defecto registrándose simultáneamente. Cada
// una conserva identidad/ruta propia y puede resolverse sin depender de paneId.
const concurrent = await Promise.all(Array.from({ length: LOAD_COUNT }, (_, index) => {
  const agent = `agent-${index + 1}`;
  return registry.heartbeat({ tab: { id: 30 + index }, frameId: index + 1 }, snapshot(agent, {
    adapter: index % 2 ? 'gemini' : 'chatgpt',
    conversation: `https://provider.test/c/${agent}`,
    context: {
      surface: 'arena', surfaceInstanceId: 'surface-load-12', paneId: agent,
      channelId: `surface-load-12:${agent}`, mode: 'embedded',
      role: index % 3 === 0 ? 'reviewer' : 'builder', runId: 'run-load-12',
    }, state: 'generating',
  }), 'concurrency_test');
}));
assert.equal(new Set(concurrent.map(item => item.endpointId)).size, LOAD_COUNT, `${LOAD_COUNT} identidades lógicas únicas`);
assert.equal(new Set(concurrent.map(item => item.physicalKey)).size, LOAD_COUNT, `${LOAD_COUNT} rutas físicas aisladas`);
assert.equal(
  (await registry.list()).filter(item => item.runId === 'run-load-12' && item.state === 'generating').length,
  LOAD_COUNT,
  `${LOAD_COUNT} sesiones permanecen trabajando simultáneamente`,
);
const routed = await Promise.all(concurrent.map(item => registry.resolve(item.endpointId)));
assert.deepEqual(
  routed.map(item => item.physicalKey).sort(),
  concurrent.map(item => item.physicalKey).sort(),
  'resolver endpointId conserva la ruta exacta bajo concurrencia',
);
await assert.rejects(
  registry.resolve({ surface: 'arena', runId: 'run-load-12' }),
  new RegExp(`Destino ambiguo: ${LOAD_COUNT} endpoints`),
  'el orquestador se niega a adivinar entre destinos múltiples',
);

// Rebind: la identidad agent-1 migra de tab/frame sin duplicarse y restaura
// la protección de la tab anterior.
const reboundTabId = 30 + LOAD_COUNT;
const rebound = await registry.heartbeat({ tab: { id: reboundTabId }, frameId: 777 }, snapshot('agent-1', {
  adapter: 'chatgpt', conversation: 'https://provider.test/c/agent-1-reloaded',
  context: {
    surface: 'arena', surfaceInstanceId: 'surface-load-12', paneId: 'agent-1',
    channelId: 'surface-load-12:agent-1', mode: 'embedded', role: 'reviewer', runId: 'run-load-12',
  },
}), 'rebind_test');
assert.equal(rebound.endpointId, 'surface-load-12:agent-1');
assert.equal((await registry.resolve(rebound.endpointId)).physicalKey, `${reboundTabId}:777`);
assert.equal(tabs.get(30).autoDiscardable, true, 'rebind restaura la tab física anterior');
assert.equal((await registry.list()).filter(item => item.endpointId === rebound.endpointId).length, 1);

await Promise.all(concurrent.slice(1).map((_, index) =>
  registry.release({ tab: { id: 31 + index }, frameId: index + 2 }, 'load_test_done')));
await registry.release({ tab: { id: reboundTabId }, frameId: 777 }, 'load_test_done');
assert.equal(
  [...tabs.entries()].filter(([id]) => id >= 30).every(([, tab]) => tab.autoDiscardable === true),
  true,
  `todas las protecciones se restauran tras cerrar ${LOAD_COUNT} sesiones`,
);

console.log(`OK — Endpoint Registry: identidad, routing, rebind y ${LOAD_COUNT} sesiones concurrentes`);
