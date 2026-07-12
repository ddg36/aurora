// Aurora Hub — Auth Escape Content Script
// Corre en: dominios de login/OAuth (auth.openai.com, accounts.google.com, etc.)
// Función: si ese dominio carga DENTRO de un iframe anidado (el LLM embebido
// en Aurora), el flujo de sesión se pierde por storage partitioning del
// navegador (limitación dura, no arreglable con permisos ni sandbox) —
// en vez de dejar que falle con un error confuso, se reabre la misma URL
// en una pestaña real (top-level, sin partitioning) donde el login sí
// funciona normal.

// Mismos dominios que el content_scripts[0].matches de manifest.json — son
// los únicos sitios que Aurora realmente embebe. Si el ancestro MÁS externo
// ya es uno de estos (no chrome-extension://, no el host de Aurora), no hay
// Aurora de por medio: es el propio sitio anidando su login/cookie-sync
// interno dentro de SU PROPIA página (ej. RotateCookiesPage de Google,
// que gemini.google.com carga solo para sincronizar cookies particionadas
// entre subdominios — no es una pantalla de login, y pasa igual con o sin
// Aurora instalada). Bug real: sin este chequeo, abrir cualquiera de estos
// LLMs en una pestaña NORMAL (sin Aurora) también disparaba el escape a
// pestaña nueva para ese iframe interno.
const PROVEEDORES_EMBEBIDOS = [
  'gemini.google.com', 'chat.openai.com', 'chatgpt.com', 'claude.ai',
  'grok.com', 'perplexity.ai', 'copilot.microsoft.com', 'kimi.moonshot.cn',
];

// Endpoints internos de sync de cookies particionadas (no son login) — pasan
// SIEMPRE, aunque el iframe sí cuelgue de Aurora, y nunca hay que escaparlos.
const RUTAS_NO_LOGIN = ['/RotateCookiesPage', '/ListAccounts', '/CheckCookie'];

(function () {
  'use strict';

  if (RUTAS_NO_LOGIN.some(r => location.pathname.startsWith(r))) return;
  if (window.top === window.self) return; // ya es top-level, nada que hacer

  // Si el top-level de la cadena es una página chrome-extension://, el login
  // SÍ funciona in-place (Chrome no particiona cookies cuando el top-level es
  // la extensión y ésta tiene host_permissions del sitio) — no hay que
  // escapar. Sólo escapamos si el iframe cuelga de una página web normal
  // (ej. localhost:7779), donde el flujo de sesión se rompe.
  try {
    const anc = location.ancestorOrigins;
    const top = anc && anc.length ? anc[anc.length - 1] : '';
    if (top.startsWith('chrome-extension://')) return;
    const topHost = top ? new URL(top).hostname : '';
    if (PROVEEDORES_EMBEBIDOS.some(h => topHost === h || topHost.endsWith('.' + h))) return;
  } catch (_) { /* ancestorOrigins no soportado: seguir con el escape */ }

  chrome.runtime.sendMessage({
    type: 'NAVIGATE_TO',
    url: location.href,
    new_tab: true,
  }).catch(() => {});

  document.body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font:14px system-ui;color:#333;text-align:center;gap:8px;padding:24px;"><div style="font-size:24px">↗</div><div>Abriendo el inicio de sesión en una pestaña nueva…</div><div style="font-size:12px;color:#888">El login dentro de un panel embebido no puede mantener la sesión.</div></div>';
})();
