// session-sniffer — corre SOLO en iframes de LLMs (all_frames en manifest).
// Detecta el cambio de URL de la SPA (pushState/replaceState/popstate) y lo
// reporta al background, que lo persiste en Aurora (/db/llm/history, slot
// 'sniffer', clave = host). Al reabrir LLM Cloud, Aurora restaura ese hilo.
// window.top === window → tab real del usuario, no iframe: no se espía.
(() => {
  if (window.top === window) return;
  // Reporta SOLO iframes montados por Aurora: el padre inmediato es la UI
  // (localhost:7779 — cubre el Cloud Backend de Lyra, anidado en /ui) o una
  // página de extensión (panes de LLM Cloud en newtab/sidepanel). Los sitios
  // anidan iframes propios (gemini /_/bscframe, botguard) donde este script
  // también corre por all_frames — si reportaran, su URL interna pisaría el
  // hilo real y la restauración cargaría un frame en blanco.
  const padre = location.ancestorOrigins?.[0] || '';
  if (!/^chrome-extension:|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(padre)) return;

  let ultima = '';
  let timer = null;

  // Rutas de auth/login en el mismo host: NO persistir — la cookie murió y
  // el sitio redirigió; guardar esto pisaría el hilo real con una pantalla
  // de login. El hilo guardado queda intacto para cuando vuelva la sesión.
  const AUTH_RE = /\/(auth|login|signin|sign-in|logout|signup|onboarding)([/?#]|$)/i;

  function reportar() {
    const url = location.href;
    if (url === ultima) return;
    ultima = url;
    const path = new URL(url).pathname;
    if (AUTH_RE.test(path)) return;
    // Home/raíz (0–1 segmentos: /, /app, /new) NO se persiste: un hilo real
    // siempre es más profundo (/app/<id>, /c/<uuid>). Sin esto, un rebote
    // del sitio al home pisaría el hilo guardado y se perdería la sesión.
    if (path.split('/').filter(Boolean).length < 2) return;
    try { chrome.runtime.sendMessage({ type: 'LLM_SESSION_URL', url }); } catch (_) {}
  }

  function programar() {
    clearTimeout(timer);
    // Debounce: las SPAs encadenan varios replaceState al abrir un hilo.
    timer = setTimeout(reportar, 800);
  }

  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  history.pushState = function (...a) { push(...a); programar(); };
  history.replaceState = function (...a) { replace(...a); programar(); };
  window.addEventListener('popstate', programar);
  window.addEventListener('hashchange', programar);
  // Fallback para navegación que no toca history (redirects internos).
  setInterval(programar, 3000);

  reportar();
})();
