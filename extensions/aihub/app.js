const SERVERS = [
  { url: "http://localhost:7779" },
  { url: "http://127.0.0.1:7779" }
];

const STORAGE_KEY = "aihub:lastServer";
const frame = document.getElementById("auroraFrame");
const status = document.getElementById("status");
const retry = document.getElementById("retry");

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

async function connect() {
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
      loadFrame(`${server.url}/`);
      return;
    }
  }

  setStatus("Sin conexión", "error");
  retry.disabled = false;
}

// Cargar iframe solo después de que la página haya pintado
function loadFrame(url) {
  if (!url) return;
  const t = window.requestIdleCallback
    ? requestIdleCallback(() => { frame.src = url; }, { timeout: 2000 })
    : setTimeout(() => { frame.src = url; }, 100);
}

retry.addEventListener("click", () => {
  frame.src = "about:blank";
  connect();
});

// Cargar después del paint inicial
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    connect();
  });
});
