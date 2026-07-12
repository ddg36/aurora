const SERVERS = [
  { url: "http://localhost:7779" },
  { url: "http://127.0.0.1:7779" }
];

const STORAGE_KEY = "aihub:lastServer";
const frame = document.getElementById("auroraFrame");
const status = document.getElementById("status");
const retry = document.getElementById("retry");

// Puente compartido con Aurora (handshake, LLM cloud embebido, clipboard) —
// mismo módulo que usa sidepanel.js. Sin esto, Aurora en pestaña nueva nunca
// avisaba `caps:['llmPanes']` y caía al iframe inline de LLM cloud (sujeto al
// bug de cookie-partitioning que este puente existe para evitar) — bug real:
// login/sesión de LLM se perdía SOLO acá, andaba bien en el side panel.
//
// Se inicializa recién con la URL de servidor REAL resuelta por connect()
// (localhost o 127.0.0.1, según cuál responda) — el puente compara
// `e.origin` contra esa URL exacta para aceptar mensajes; inicializarlo con
// una URL fija que no sea la que el iframe termina cargando lo deja sordo.
let _bridge = null;
function ensureBridge(serverUrl) {
  if (_bridge) return _bridge;
  _bridge = initAuroraBridge(frame, { serverUrl, surface: 'newtab' });
  return _bridge;
}

function setStatus(text, state) {
  status.textContent = text;
  status.dataset.state = state;
}

function getSavedServer() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) {
      resolve(localStorage.getItem(STORAGE_KEY));
      return;
    }
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      resolve(result[STORAGE_KEY] || null);
    });
  });
}

function saveServer(url) {
  if (chrome?.storage?.local) {
    chrome.storage.local.set({ [STORAGE_KEY]: url });
    return;
  }
  localStorage.setItem(STORAGE_KEY, url);
}

async function canReach(serverUrl) {
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${serverUrl}/health`, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal
    });
    return response.ok || response.type === "opaque";
  } catch {
    return false;
  }
}

async function connect(forceFresh = false) {
  setStatus("Conectando...", "pending");
  retry.disabled = true;

  const savedUrl = await getSavedServer();
  const servers = savedUrl
    ? [SERVERS.find(s => s.url === savedUrl), ...SERVERS.filter(s => s.url !== savedUrl)].filter(Boolean)
    : SERVERS;

  for (const server of servers) {
    if (await canReach(server.url)) {
      saveServer(server.url);
      setStatus("Conectado", "ok");
      retry.disabled = false;
      ensureBridge(server.url);
      loadFrame(`${server.url}/`, forceFresh);
      return;
    }
  }

  setStatus("Sin conexión", "error");
  retry.disabled = false;
}

// _r=timestamp bustea la cache del documento top-level — solo se aplica en
// retry manual (forceFresh=true). En connect() automático NO se aplica: el
// server ya cachea /ui con max-age=60 + query strings versionadas por archivo,
// forzar bypass en cada conexión automática volvía a pagar red completa
// (40-60s) en cada apertura de tab en vez de servir desde cache local.
function loadFrame(url, forceFresh = false) {
  if (!url) return;
  const fresh = forceFresh
    ? url + (url.includes('?') ? '&' : '?') + '_r=' + Date.now()
    : url;
  const t = window.requestIdleCallback
    ? requestIdleCallback(() => { frame.src = fresh; }, { timeout: 2000 })
    : setTimeout(() => { frame.src = fresh; }, 100);
}

retry.addEventListener("click", () => {
  frame.src = "about:blank";
  connect(true);
});

// connect() es async y no bloquea paint — no depende de rAF (que Chrome
// pausa en tabs en background, dejando "Conectando..." colgado para siempre
// si esta tab de New Tab no queda enfocada al abrirse).
connect();

// Red de seguridad: si la tab estaba en background durante el intento inicial
// y algo quedó a medias, reintentar al volverse visible.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && status.dataset.state === "pending" && !retry.disabled) {
    connect();
  }
});
