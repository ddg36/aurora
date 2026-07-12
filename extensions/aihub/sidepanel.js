// Sólo lo específico del side panel (chequeo de servidor + UI de offline).
// El puente con Aurora (handshake, LLM cloud, clipboard/background) vive en
// aurora-bridge.js, compartido con app.js (newtab) — ver ese archivo.
const AURORA_URL = 'http://localhost:7779';
const AURORA_UI  = 'http://localhost:7779/ui/';
const frame   = document.getElementById('frame');
const offline = document.getElementById('offline');
const retryBtn = document.getElementById('retry-btn');

const bridge = initAuroraBridge(frame, { serverUrl: AURORA_URL, surface: 'sidepanel' });

async function checkServer() {
  try {
    const r = await fetch(AURORA_URL + '/health', { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

async function init() {
  const ok = await checkServer();
  if (ok) {
    frame.style.display = 'block';
    offline.classList.remove('show');
    frame.src = AURORA_UI;
  } else {
    frame.style.display = 'none';
    offline.classList.add('show');
  }
}

retryBtn.addEventListener('click', init);

init();
