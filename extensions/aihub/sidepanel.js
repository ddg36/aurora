const AURORA_URL = 'http://localhost:7779';
const AURORA_UI  = 'http://localhost:7779/ui/';
const frame   = document.getElementById('frame');
const offline = document.getElementById('offline');
const retryBtn = document.getElementById('retry-btn');

const ACTIVE_EXTENSIONS = ['aihub'];

let _auroraToken = null;

// ── Bridge logging (accesible via CDP desde background) ──────
window.__aurora_bridgeLog = [];
const _log = (type, detail) => {
  const entry = { t: Date.now(), type, detail };
  window.__aurora_bridgeLog.push(entry);
  if (window.__aurora_bridgeLog.length > 200) window.__aurora_bridgeLog.shift();
  console.log('[BRIDGE]', type, JSON.stringify(detail).slice(0, 200));
};

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'AURORA_TOKEN_UPDATE') {
    _log('token_update', { token: msg.token?.slice(0, 8) });
    _auroraToken = msg.token;
    if (frame.contentWindow) {
      frame.contentWindow.postMessage({
        type: 'AURORA_TOKEN',
        token: msg.token,
        usuario_id: msg.usuario_id,
        serverUrl: msg.serverUrl || AURORA_URL,
      }, AURORA_URL);
    }
  }
});

async function checkServer() {
  try {
    const r = await fetch(AURORA_URL + '/health', { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

let _helloInterval = null;

function sendHello() {
  if (!frame.contentWindow) return;
  frame.contentWindow.postMessage({
    type:        'AURORA_EXT_HELLO',
    extensionId: chrome.runtime.id,
    extensions:  ACTIVE_EXTENSIONS,
    token:       _auroraToken,
  }, AURORA_URL);
}

function startHelloLoop() {
  stopHelloLoop();
  sendHello();
  _helloInterval = setInterval(sendHello, 800);
}

function stopHelloLoop() {
  if (_helloInterval) { clearInterval(_helloInterval); _helloInterval = null; }
}

function replyToFrame(id, result) {
  if (!frame.contentWindow) return;
  frame.contentWindow.postMessage({ type: 'AURORA_BG_RESPONSE', id, result }, AURORA_URL);
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

frame.addEventListener('load', () => setTimeout(startHelloLoop, 300));

window.addEventListener('message', (e) => {
  if (e.origin !== AURORA_URL) return;

  if (e.data?.type === 'AURORA_EXT_ACK') { _log('ack', {}); stopHelloLoop(); return; }

  if (e.data?.type === 'AURORA_BG_REQUEST') {
    const { id, payload } = e.data;
    _log('bg_request', { id, type: payload?.type, args: Object.keys(payload||{}).join(',') });

    // Clipboard — el sidepanel tiene acceso directo, el SW no
    if (payload?.type === 'CLIPBOARD_WRITE') {
      navigator.clipboard.writeText(payload.text || '')
        .then(() => { _log('bg_response', { id, ok: true }); replyToFrame(id, { ok: true }); })
        .catch(err => { _log('bg_response', { id, error: err.message }); replyToFrame(id, { ok: false, error: err.message }); });
      return;
    }

    if (payload?.type === 'CLIPBOARD_READ') {
      navigator.clipboard.readText()
        .then(text => { _log('bg_response', { id, ok: true, len: text.length }); replyToFrame(id, { ok: true, text }); })
        .catch(err => { _log('bg_response', { id, error: err.message }); replyToFrame(id, { ok: false, error: err.message, text: '' }); });
      return;
    }

    // Todo lo demás → background
    _log('bg_forward', { id, type: payload?.type });
    const t0 = Date.now();
    chrome.runtime.sendMessage(payload, (res) => {
      const elapsed = Date.now() - t0;
      _log('bg_response', { id, elapsed, ok: res?.success, error: res?.error?.slice(0, 100), type: payload?.type });
      replyToFrame(id, res);
    });
  }
});

init();
