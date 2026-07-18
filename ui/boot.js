
// Listener temprano para AURORA_EXT_HELLO — puede llegar antes del boot async completo.
// Cola de mensajes pendientes que se procesan cuando initExtBridge corre.
(function() {
  const queue = [];
  window.addEventListener('message', function earlyHello(e) {
    if (e.data?.type === 'AURORA_EXT_HELLO') {
      queue.push(e);
      // ACK inmediato aunque el setter todavía no esté listo
      try { window.parent.postMessage({ type: 'AURORA_EXT_ACK' }, '*'); } catch(_) {}
    }
  });
  globalThis.__aurora_ext_hello_queue = queue;
})();

globalThis.html = globalThis.htm.bind(globalThis.preact.h);

window.addEventListener("error", ev => {

console.error("[Aurora v2] window error", ev.message, ev.filename, ev.lineno, ev.colno, ev.error);

});

window.addEventListener("unhandledrejection", ev => {

console.error("[Aurora v2] unhandled rejection", ev.reason);

});

const core = globalThis.preactSignalsCore;

const signals = globalThis.preactSignals;

if (core) {

globalThis.signal = core.signal;

globalThis.computed = core.computed;

globalThis.effect = core.effect;

globalThis.batch = core.batch;

}

if (signals) {

globalThis.useSignal = signals.useSignal;

globalThis.useComputed = signals.useComputed;

globalThis.useSignalEffect = signals.useSignalEffect;

}

const BASE = /^https?:/.test(location.origin) ? location.origin : "http://localhost:7779";

globalThis.AURORA_BASE = BASE;

globalThis.AURORA_BACKEND_URL = BASE;

globalThis.AURORA_NEXUS_URL = BASE;

globalThis.AURORA_TOKEN = () => localStorage.getItem("aurora_token") || "";

globalThis.AURORA_HDRS = () => ({

Authorization: "Bearer " + (localStorage.getItem("aurora_token") || ""),

"Content-Type": "application/json",

});

globalThis.__AURORA_BASE__ = BASE;

globalThis.__AURORA_TOKEN__ = globalThis.AURORA_TOKEN;

globalThis.__AURORA_HDRS__ = globalThis.AURORA_HDRS;

function setupTwind() {

const twind = globalThis.twind;

if (!twind?.setup) return;

twind.setup({

mode: twind.silent,

theme: {

extend: {

colors: {

"aurora-bg": "var(--aurora-bg)",

"aurora-surface": "var(--aurora-surface)",

"aurora-surface-1": "var(--aurora-surface-1)",

"aurora-surface-2": "var(--aurora-surface-2)",

"aurora-surface2": "var(--aurora-surface2)",

"aurora-surface3": "var(--aurora-surface3)",

"aurora-border": "var(--aurora-border)",

"aurora-accent": "var(--aurora-accent)",

"aurora-accent-dim": "var(--aurora-accent-dim)",

"aurora-text": "var(--aurora-text)",

"aurora-text-dim": "var(--aurora-text-dim)",

"aurora-text-muted": "var(--aurora-text-muted)",

"aurora-error": "var(--aurora-error)",

"aurora-success": "var(--aurora-success)",

"aurora-warning": "var(--aurora-warning)",

},

},

},

});

const utilityPattern = /^(?:-?m[trblxy]?-.+|p[trblxy]?-.+|flex(?:-.+)?|grid(?:-.+)?|block|inline(?:-.+)?|hidden|contents|items-.+|justify-.+|content-.+|self-.+|gap(?:-[xy])?-.+|w-.+|h-.+|min-[wh]-.+|max-[wh]-.+|text-.+|font-.+|leading-.+|tracking-.+|bg-.+|border(?:-.+)?|rounded(?:-.+)?|overflow(?:-[xy])?-.+|shrink(?:-.+)?|grow(?:-.+)?|cursor-.+|pointer-events-.+|transition(?:-.+)?|duration-.+|ease-.+|opacity-.+|whitespace-.+|truncate|select-.+|resize(?:-.+)?|sticky|relative|absolute|fixed|top-.+|right-.+|bottom-.+|left-.+|inset-.+|z-.+|shadow(?:-.+)?|ring(?:-.+)?|outline(?:-.+)?|backdrop-.+|animate-.+|break-.+|object-.+|place-.+|space-[xy]-.+|divide-.+|align-.+|aspect-.+|col-.+|row-.+|order-.+|basis-.+|hover:.+|active:.+|disabled:.+|focus:.+|focus-visible:.+|group-hover:.+|first:.+|last:.+|sm:.+|md:.+|lg:.+|xl:.+)$/;

const processed = new Set();

function processClassName(className) {

const tokens = String(className || "").split(/\s+/).filter(Boolean).filter(t => utilityPattern.test(t));

if (!tokens.length) return;

const key = tokens.join(" ");

if (processed.has(key)) return;

processed.add(key);

try { twind.tw(key); } catch (e) { console.warn("[Aurora v2/twind]", key, e); }

}

function processNode(node) {

if (!node || node.nodeType !== 1) return;

if (node.hasAttribute?.("class")) processClassName(node.getAttribute("class"));

node.querySelectorAll?.("[class]").forEach(el => processClassName(el.getAttribute("class")));

}

globalThis.auroraTwind = {

apply(root = document) { processNode(root.documentElement ?? root); },

};

new MutationObserver(records => {

for (const r of records) {

if (r.type === "attributes") { processNode(r.target); continue; }

for (const node of r.addedNodes) processNode(node);

}

}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

requestAnimationFrame(() => globalThis.auroraTwind.apply());

}

async function ensureAuroraUser() {

const existing = localStorage.getItem("aurora_token");

if (existing) return existing;

const res = await fetch(BASE + "/db/usuarios/init", {

method: "POST",

headers: { "Content-Type": "application/json" },

body: JSON.stringify({

nombre: "deml",

workspace_root: "/media/almacen/deml/Downloads/core_instruction",

}),

});

if (!res.ok) throw new Error("usuarios/init failed " + res.status);

const data = await res.json();

if (data.token) localStorage.setItem("aurora_token", data.token);

return data.token || "";

}

setupTwind();

await ensureAuroraUser().catch(err => {

console.warn("[Aurora v2] auth init failed", err);

});

const [{ App }, store, extBridge, eventos, agentEye, cloudBridge] = await Promise.all([

import("./app.js?v=v5-cloud-recovery-1"),

import("./store.js"),

import("./components/shared/ext-bridge.js"),

import("./components/shared/eventos-ws.js"),

import("./components/shared/agent-eye.js"),

import("./components/shared/cloud-bridge-listener.js"),

]);

eventos.conectarEventos();

agentEye.initAgentEye();

cloudBridge.initCloudBridge();

globalThis.__aurora_setExtContext = store.setExtContext;
globalThis.__aurora_extContext    = store.extContext;
globalThis.__aurora_enExtension   = store.enExtension;
globalThis.__aurora_bgRequest     = extBridge.bgRequest;

extBridge.initExtBridge();

const root = document.getElementById("root");

if (!root) throw new Error("[Aurora v2] root no encontrado");

preact.render(preact.h(App, {}), root);

async function ping() {

try {

store.nexusOnline.value = (await fetch(BASE + "/ping", { signal: AbortSignal.timeout(2000) })).ok;

} catch {

store.nexusOnline.value = false;

}

}

ping();

setInterval(ping, 30000);
