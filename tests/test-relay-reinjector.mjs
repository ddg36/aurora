import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'extensions/aihub/background/relay-reinjector.js'), 'utf8');
const courierSource = fs.readFileSync(path.join(root, 'extensions/aihub/content-scripts/provider-relay.js'), 'utf8');
assert.match(source, /2026-07-17\.2-endpoint-routing/);
assert.match(courierSource, /2026-07-17\.2-endpoint-routing/, 'background y courier deben compartir build de ping');
assert.match(courierSource, /previousInstall\?\.dispose/, 'upgrade desmonta el courier anterior');
const courierBuild = new Map([['7:0', '2026-07-17.1-endpoint-registry']]);
const courierRuntime = new Map([['7:0', false]]);
const mainReady = new Map([['7:0', true], ['7:1', false], ['7:2', true]]);
const injections = [];
const key = target => `${target.tabId}:${target.frameIds[0]}`;
const chrome = {
  tabs: {
    async query() { return [{ id: 7, url: 'https://chatgpt.com/c/test' }]; },
    async sendMessage(tabId, _message, options) {
      const id = `${tabId}:${options.frameId}`;
      if (!courierBuild.has(id)) throw new Error('Receiving end does not exist');
      return { ok: true, build: courierBuild.get(id), runtimeAlive: courierRuntime.get(id) === true };
    },
    onActivated: { addListener() {} },
    onUpdated: { addListener() {} },
  },
  webNavigation: {
    async getAllFrames() { return [
      { frameId: 0, url: 'https://chatgpt.com/c/test' },
      { frameId: 1, url: 'https://gemini.google.com/app' },
      { frameId: 2, url: 'https://gemini.google.com/_/bscframe' },
    ]; },
  },
  scripting: {
    async executeScript(options) {
      const id = key(options.target);
      if (options.func && options.world === 'ISOLATED') {
        courierBuild.delete(id);
        courierRuntime.delete(id);
        injections.push({ id, world: options.world, reset: true });
        return [];
      }
      if (options.func) {
        const frameId = options.target.frameIds[0];
        return [{ result: {
          ready: !!mainReady.get(id), adapter: frameId === 0 ? 'chatgpt' : 'gemini',
          composerReady: frameId !== 2, generating: frameId === 0,
          context: frameId === 0
            ? { surface: 'tab', mode: 'top-level' }
            : frameId === 1
              ? { surface: 'lyria-cloud', mode: 'embedded', channelId: 'surface:cloud' }
              : { surface: 'embedded-unknown', mode: 'embedded' },
        } }];
      }
      injections.push({ id, world: options.world, files: options.files });
      if (options.world === 'MAIN') mainReady.set(id, true);
      if (options.world === 'ISOLATED') {
        courierBuild.set(id, '2026-07-17.2-endpoint-routing');
        courierRuntime.set(id, true);
      }
      return [];
    },
  },
};
const context = vm.createContext({ chrome, globalThis: null, URL, Object, Array, Map, Set, Promise, Number, String, setTimeout, clearTimeout, Symbol });
context.globalThis = context;
vm.runInContext(source, context, { filename: 'relay-reinjector.js' });

const first = await context.AuroraRelayReinjector.scan('contract');
assert.equal(first.ok, true);
assert.equal(first.reports.find(item => item.frameId === 0).state, 'upgraded', 'courier viejo se reemplaza en caliente');
assert.equal(first.reports.find(item => item.frameId === 0).generating, true, 'reconecta sin detener generación');
assert.equal(first.reports.find(item => item.frameId === 1).mainInjected, true, 'reconstruye MAIN si falta');
assert.equal(first.reports.find(item => item.frameId === 2).state, 'ignored', 'ignora subframe interno');
assert.equal(injections.filter(item => item.id === '7:0' && item.world === 'MAIN').length, 0, 'MAIN vivo no se duplica');
assert.equal(injections.filter(item => item.world === 'ISOLATED' && item.files).length, 2);

const before = injections.length;
const second = await context.AuroraRelayReinjector.scan('contract_repeat');
assert.equal(second.reports.filter(item => item.state === 'alive').length, 2);
assert.equal(injections.length, before, 'ping hace la reinyección idempotente');

console.log('OK — Relay Reinjector: ping, recuperación no disruptiva e idempotencia');
