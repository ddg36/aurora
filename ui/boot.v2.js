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

const BASE = "http://localhost:7779";

globalThis.__AURORA_BASE__ = BASE;
globalThis.__AURORA_BACKEND_URL__ = BASE;
globalThis.__AURORA_NEXUS_URL__ = BASE;

globalThis.__AURORA_TOKEN__ = () => localStorage.getItem("aurora_token") || "";
globalThis.__AURORA_HDRS__ = () => ({
  Authorization: "Bearer " + (localStorage.getItem("aurora_token") || ""),
  "Content-Type": "application/json",
});

function setupTwind() {
  const twind = globalThis.twind;
  if (!twind?.setup) return;

  twind.setup({
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

  if (typeof twind.observe === "function") {
    twind.observe(document.documentElement);
  }
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

await import("./aihub-ui/globals.js").catch(err => {
  console.warn("[Aurora v2] aihub-ui globals unavailable", err);
});

await import("./components/globals.js").catch(err => {
  console.warn("[Aurora v2] components globals unavailable", err);
});

const [{ App }, store] = await Promise.all([
  import("./app.js"),
  import("./store.js"),
]);

const root = document.getElementById("root");
if (!root) throw new Error("[Aurora v2] root no encontrado");

preact.render(html`<${App} />`, root);

async function ping() {
  try {
    store.nexusOnline.value = (await fetch(BASE + "/ping", { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    store.nexusOnline.value = false;
  }
}

ping();
setInterval(ping, 30000);

console.log("[Aurora v2] arrancada con app.js + signals");
