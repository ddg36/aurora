
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

async function _chequearSetup() {
  try {
    const r = await fetch(BASE + '/setup/status');
    if (!r.ok) return;
    const st = await r.json();
    if (st.pi_sdk?.ok) return;
    await new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
      const check = (ok, label, detail, href) => `
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;text-align:left">
          <span style="font-size:18px;margin-top:1px">${ok ? '✅' : '❌'}</span>
          <div>
            <div style="color:${ok ? '#86efac' : '#fca5a5'};font-weight:600;font-size:14px">${label}</div>
            ${detail ? `<div style="color:#666;font-size:12px;margin-top:2px">${detail}</div>` : ''}
            ${href && !ok ? `<a data-ext-link="${href}" href="${href}"
              style="font-size:12px;color:#7dd3fc;text-decoration:underline;cursor:pointer;margin-top:4px;display:inline-block">
              → ${href}</a>` : ''}
          </div>
        </div>`;
      overlay.innerHTML = `
        <div style="background:#111;border:1px solid #222;border-radius:14px;padding:40px 36px;width:360px;text-align:center">
          <div style="font-size:24px;font-weight:700;color:#fff;margin-bottom:6px">Aurora</div>
          <div style="font-size:13px;color:#666;margin-bottom:28px">Verificando requisitos…</div>
          <div style="margin-bottom:24px">
            ${check(true, 'Python', 'Servidor corriendo')}
            ${check(st.pi_sdk?.ok, 'Pi', st.pi_sdk?.ok ? 'Instalado' : 'Agente de herramientas opcional', 'https://pi.dev/')}
          </div>
          <div style="display:flex;gap:10px">
            <button id="aurora-setup-retry"
              style="flex:1;padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:13px;cursor:pointer">
              Verificar de nuevo
            </button>
            <button id="aurora-setup-continue"
              style="flex:1;padding:10px;border-radius:8px;border:none;background:#fff;color:#000;font-size:13px;font-weight:600;cursor:pointer">
              Continuar
            </button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelectorAll('[data-ext-link]').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault();
          const url = a.getAttribute('data-ext-link');
          try { window.open(url, '_blank'); } catch (_) {}
          // fallback: postear al parent (extensión) para que abra la URL
          try { window.parent.postMessage({ type: 'AURORA_OPEN_URL', url }, '*'); } catch (_) {}
        });
      });
      overlay.querySelector('#aurora-setup-continue').addEventListener('click', () => {
        overlay.remove(); resolve();
      });
      overlay.querySelector('#aurora-setup-retry').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'Verificando…';
        overlay.remove(); await _chequearSetup(); resolve();
      });
    });
  } catch (_) {}
}

function _notificarExtension(nombre, token) {
  if (window.parent === window) return;
  try {
    window.parent.postMessage({
      type: 'AURORA_BG_REQUEST', id: 'auth-init',
      payload: { type: 'AURORA_SAVE_AUTH', nombre, token },
    }, '*');
  } catch (_) {}
}

function _mostrarLoginOverlay() {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.id = 'aurora-login-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
    overlay.innerHTML = `
      <div style="background:#111;border:1px solid #333;border-radius:12px;padding:40px 36px;width:320px;text-align:center">
        <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:8px">Aurora</div>
        <div style="font-size:13px;color:#888;margin-bottom:28px">¿Con qué nombre entrás?</div>
        <input id="aurora-login-input" type="text" placeholder="Tu nombre..." autocomplete="off" spellcheck="false"
          style="width:100%;box-sizing:border-box;padding:10px 14px;border-radius:8px;border:1px solid #444;background:#1a1a1a;color:#fff;font-size:15px;outline:none;margin-bottom:16px"/>
        <button id="aurora-login-btn"
          style="width:100%;padding:10px;border-radius:8px;border:none;background:#fff;color:#000;font-size:15px;font-weight:600;cursor:pointer">
          Entrar
        </button>
        <div id="aurora-login-error" style="margin-top:12px;font-size:12px;color:#f87171;min-height:16px"></div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#aurora-login-input');
    const btn = overlay.querySelector('#aurora-login-btn');
    const errorEl = overlay.querySelector('#aurora-login-error');
    input.focus();

    const intentar = async () => {
      const nombre = input.value.trim();
      if (!nombre) { errorEl.textContent = 'Escribí tu nombre para continuar.'; return; }
      btn.disabled = true; btn.textContent = '…'; errorEl.textContent = '';
      try {
        const res = await fetch(BASE + '/db/usuarios/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre }),
        });
        if (!res.ok) throw new Error('Error del servidor (' + res.status + ')');
        const data = await res.json();
        if (!data.token) throw new Error('Sin token en la respuesta');
        localStorage.setItem('aurora_token', data.token);
        _notificarExtension(nombre, data.token);
        overlay.remove();
        resolve(data.token);
      } catch (err) {
        errorEl.textContent = err.message || 'No se pudo conectar con el servidor.';
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    };

    btn.addEventListener('click', intentar);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') intentar(); });
  });
}

async function ensureAuroraUser() {
  const existing = localStorage.getItem('aurora_token');

  if (existing) {
    // Validar el token contra el servidor antes de usarlo.
    try {
      const r = await fetch(BASE + '/db/usuarios/me', {
        headers: { Authorization: 'Bearer ' + existing },
      });
      if (r.ok) {
        const data = await r.json().catch(() => ({}));
        // Re-sincronizar extensión aunque la sesión ya existiera — cubre el
        // caso de extensión reinstalada sin que aparezca el overlay de login.
        _notificarExtension(data.nombre || '', existing);
        return existing;
      }
    } catch (_) {}
    // Token inválido o servidor caído — limpiar y pedir login.
    localStorage.removeItem('aurora_token');
  }

  return _mostrarLoginOverlay();
}

setupTwind();

await _chequearSetup();

await ensureAuroraUser().catch(err => {

console.warn("[Aurora v2] auth init failed", err);

});

const [{ App }, store, extBridge, eventos, agentEye, cloudBridge] = await Promise.all([

import("./app.js?v=v47-performance-tooling"),

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
