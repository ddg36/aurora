import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scripts = path.join(root, 'extensions/aihub/content-scripts');
const relayDir = path.join(scripts, 'relay');
const read = file => fs.readFileSync(file, 'utf8');

function loadProvider(name, hostname) {
  const document = {
    documentElement: { dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const context = vm.createContext({
    document, location: { hostname, pathname: '/', href: `https://${hostname}/` },
    globalThis: null, Object, Array, JSON, RegExp, String, Number, Boolean,
  });
  context.globalThis = context;
  vm.runInContext(read(path.join(relayDir, 'relay-contract.js')), context, { filename: 'relay-contract.js' });
  vm.runInContext(read(path.join(relayDir, 'relay-utils.js')), context, { filename: 'relay-utils.js' });
  vm.runInContext(read(path.join(relayDir, 'providers', name)), context, { filename: name });
  return { adapter: context.__auroraRelayV2.findProvider(context.location), context };
}

for (const [name, hostname, id] of [
  ['relay-chatgpt.js', 'chatgpt.com', 'chatgpt'],
  ['relay-gemini.js', 'gemini.google.com', 'gemini'],
  ['relay-generic.js', 'claude.ai', 'generic'],
]) {
  const { adapter, context } = loadProvider(name, hostname);
  assert.equal(adapter.id, id);
  assert.equal(adapter.version, 2);
  assert.equal(context.__auroraRelayV2.validateProviderAdapter(adapter), adapter);
  for (const method of ['getInput', 'getLatestAssistant', 'readAssistant', 'getUserTurnCount', 'isGenerating', 'getConversationKey']) {
    assert.equal(typeof adapter.observe[method], 'function', `${id}.observe.${method}`);
  }
  for (const method of ['insertText', 'submit']) assert.equal(typeof adapter.act[method], 'function', `${id}.act.${method}`);
  assert(!('selectors' in adapter), `${id} no debe publicar selectores`);
  assert(!('inputSelectors' in adapter), `${id} filtró conocimiento DOM`);
}

const manifest = JSON.parse(read(path.join(root, 'extensions/aihub/manifest.json')));
const has = (script, world = 'ISOLATED') => manifest.content_scripts.some(entry =>
  entry.js?.includes(script) && (entry.world || 'ISOLATED') === world);
for (const name of ['relay-chatgpt.js', 'relay-gemini.js', 'relay-generic.js']) {
  const script = `content-scripts/relay/providers/${name}`;
  assert(has(script, 'MAIN'), `${name} missing in MAIN`);
  assert(!has(script, 'ISOLATED'), `${name} no debe duplicarse en ISOLATED`);
}
for (const common of ['relay/relay-contract.js', 'relay/relay-utils.js']) {
  assert(has(`content-scripts/${common}`, 'MAIN'));
  assert(!has(`content-scripts/${common}`, 'ISOLATED'));
}
assert(has('content-scripts/relay/relay-core.js', 'MAIN'));
assert(has('content-scripts/cloud-relay.js', 'MAIN'));
assert(has('content-scripts/provider-relay.js', 'ISOLATED'));
const courier = read(path.join(scripts, 'provider-relay.js'));
assert(courier.includes('AURORA_RELAY_SNAPSHOT'));
assert(!courier.includes('querySelector'), 'courier ISOLATED no debe conocer DOM del proveedor');

const bootstrap = read(path.join(scripts, 'cloud-relay.js'));
assert(bootstrap.split('\n').length < 70, 'cloud-relay debe permanecer pequeño');
assert(!bootstrap.includes('querySelector'), 'cloud-relay no debe conocer DOM');
assert(bootstrap.includes('findProvider'));

const core = read(path.join(relayDir, 'relay-core.js'));
for (const forbidden of ['chatgpt.com', 'gemini.google.com', '#prompt-textarea', 'user-query', 'data-message-author-role']) {
  assert(!core.includes(forbidden), `Relay Core conoce detalle de proveedor: ${forbidden}`);
}
assert(core.includes('providerAdapter.observe'));
assert(core.includes('providerAdapter.act'));

console.log('OK — Relay V2: contrato, drivers privados, mundos y core agnóstico');
