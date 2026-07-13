// Aurora Hub — Background Service Worker
importScripts('background/yt-history.js');
importScripts('background/browser-cabin.js');
// Bridge: chrome.* APIs → servidor Aurora :7779
const AURORA    = 'http://localhost:7779';
const AURORA_WS = 'ws://localhost:7779/ext/ws';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch(e => console.warn('[BG] sidePanel:', e));

// ─── WebSocket control bus con el servidor ───────────────
let _extWs = null;
let _extWsRetry = null;
let _auroraToken = null;  // token de usuario confirmado por el servidor
let _auroraUserId = null;

async function _fetchToken() {
  try {
    const r = await fetch(AURORA + '/db/usuarios/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'deml' }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.token ?? null;
  } catch { return null; }
}

async function _ensureToken() {
  if (!_auroraToken) _auroraToken = await _fetchToken();
  return _auroraToken;
}

// Headers con token — el servidor exige Bearer en todo salvo /health e init.
function _hdrs() {
  const h = { 'Content-Type': 'application/json' };
  if (_auroraToken) h.Authorization = 'Bearer ' + _auroraToken;
  return h;
}

async function connectExtWs() {
  if (_extWs && _extWs.readyState <= 1) return;
  if (!_auroraToken) _auroraToken = await _fetchToken();
  try {
    // Token también por query: el guard del server valida el WS antes del HELLO.
    _extWs = new WebSocket(AURORA_WS + '?token=' + encodeURIComponent(_auroraToken || ''));
    _extWs.onopen = () => {
      console.log('[BG] ext/ws connected');
      _extWs.send(JSON.stringify({
        type: 'EXT_HELLO',
        extensionId: chrome.runtime.id,
        extensions: ['aihub'],
        token: _auroraToken,
      }));
      if (_extWsRetry) { clearTimeout(_extWsRetry); _extWsRetry = null; }
      // Notificar tab activa inmediatamente al conectar
      notifyTabChange(null);
    };
    _extWs.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'EXT_ACK') {
        if (msg.token) {
          _auroraToken  = msg.token;
          _auroraUserId = msg.usuario_id ?? null;
          console.log('[BG] ext/ws ACK uid=' + _auroraUserId);
          // Propagar token al sidepanel para que aurora.js lo use
          chrome.runtime.sendMessage({ type: 'AURORA_TOKEN_UPDATE', token: _auroraToken, usuario_id: _auroraUserId, serverUrl: msg.serverUrl }).catch(() => {});
        }
        return;
      }
      if (msg.type === 'EXT_CMD') {
        handleServerCmd(msg).catch(err => {
          sendExtResult(msg.id, false, null, err.message);
        });
      }
    };
    _extWs.onclose = () => {
      console.log('[BG] ext/ws closed, retry in 5s');
      _extWsRetry = setTimeout(connectExtWs, 5000);
    };
    _extWs.onerror = () => {};
  } catch (err) {
    console.warn('[BG] ext/ws error', err);
    _extWsRetry = setTimeout(connectExtWs, 5000);
  }
}

function sendExtResult(id, ok, data, error) {
  if (!_extWs || _extWs.readyState !== 1) return;
  _extWs.send(JSON.stringify({ type: 'EXT_RESULT', id, ok, data: data ?? null, error: error ?? null }));
}

async function handleServerCmd(msg) {
  const { id, cmd, params = {} } = msg;
  switch (cmd) {
    case 'capture_active_tab': {
      const tab = await getActiveUserTab();
      if (!tab) { sendExtResult(id, false, null, 'no tab'); return; }
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body?.innerText?.trim().slice(0, 50000) || '',
      });
      sendExtResult(id, true, { text: res[0]?.result || '', tab: { title: tab.title, url: tab.url } });
      return;
    }
    case 'screenshot': {
      const tab = await getActiveUserTab();
      if (!tab) { sendExtResult(id, false, null, 'no tab'); return; }
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
      sendExtResult(id, true, { dataUrl, tab: { title: tab.title, url: tab.url } });
      return;
    }
    case 'get_active_tab': {
      const tab = await getActiveUserTab();
      sendExtResult(id, true, tab ? { title: tab.title, url: tab.url, id: tab.id } : null);
      return;
    }
    case 'tabs_list': {
      const all = await chrome.tabs.query({});
      const tabs = all.filter(t => t.url?.startsWith('http')).map(t => ({
        id: t.id, windowId: t.windowId, groupId: t.groupId, title: t.title || '',
        url: t.url || '', favicon: t.favIconUrl || '', active: t.active, lastAccessed: t.lastAccessed || 0,
      }));
      sendExtResult(id, true, { tabs });
      return;
    }
    case 'tabs_restore': {
      for (const t of (params.tabs || [])) if (t.url) await chrome.tabs.create({ url: t.url, active: false });
      sendExtResult(id, true, { restored: (params.tabs || []).length });
      return;
    }
    case 'meeting_snapshot': {
      const tab = await getActiveUserTab();
      if (!tab) { sendExtResult(id, false, null, 'no tab'); return; }
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const text = document.body?.innerText || '';
          const participants = [...document.querySelectorAll('[data-participant-id], [aria-label*="participant" i], [aria-label*="Participante" i]')]
            .map(el => (el.innerText || el.getAttribute('aria-label') || '').trim())
            .filter(Boolean)
            .slice(0, 80);
          return {
            titulo: document.title,
            url: location.href,
            plataforma: location.hostname,
            participantes: [...new Set(participants)],
            transcript: text.slice(0, 60000),
            chat: '',
          };
        },
      });
      sendExtResult(id, true, res[0]?.result || null);
      return;
    }
    case 'price_extract': {
      const tab = await getActiveUserTab();
      if (!tab) { sendExtResult(id, false, null, 'no tab'); return; }
      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const text = document.body?.innerText || '';
          const match = text.match(/(?:US\$|\$|S\/\.?|€)\s?([0-9]+(?:[.,][0-9]{2})?)/);
          const priceText = match?.[0] || '';
          const precio = match ? Number(match[1].replace(',', '.')) : null;
          return {
            titulo: document.title,
            url: location.href,
            precio,
            moneda: priceText.startsWith('€') ? 'EUR' : priceText.startsWith('S') ? 'PEN' : 'USD',
            stock: /out of stock|sin stock|agotado/i.test(text) ? 'out' : 'unknown',
            raw_price: priceText,
          };
        },
      });
      sendExtResult(id, true, res[0]?.result || null);
      return;
    }
    case 'capture_youtube': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) { sendExtResult(id, false, null, 'no tab'); return; }
      if (!tab.url?.includes('youtube.com/watch')) { sendExtResult(id, false, null, 'not-youtube'); return; }

      const sendWithTimeout = (t, m, ms = 20000) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Receiving end does not exist (timeout)')), ms);
        chrome.tabs.sendMessage(t, m, (r) => {
          clearTimeout(timer);
          const err = chrome.runtime.lastError;
          if (err) reject(new Error(err.message));
          else resolve(r);
        });
      });

      let result;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          result = await sendWithTimeout(tab.id, { action: 'extractData', type: params.type || 'withoutTimestamps' });
          if (result && (result.success || result.content)) break;
          throw new Error(result?.error || 'Content script no respondio');
        } catch (err) {
          if (attempt < 1 && err.message?.includes?.('Receiving end')) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content-scripts/yt-captures.js'],
              });
            } catch (_) {}
            await new Promise(r => setTimeout(r, 800));
            continue;
          }
          sendExtResult(id, false, null, err.message);
          return;
        }
      }
      sendExtResult(id, !!(result && (result.success || result.content)), result || null, result?.error || null);
      return;
    }
    default:
      sendExtResult(id, false, null, `cmd desconocido: ${cmd}`);
  }
}

// Conectar al arrancar
connectExtWs();
// Reconectar cada 30s si el server estuvo caído
setInterval(connectExtWs, 30000);

// ChatGPT/Gemini crean conversaciones mediante history.pushState y en ciertos
// renders reemplazan el mundo aislado sin disparar una navegación que vuelva a
// inyectar content_scripts. Reinyectar idempotentemente en ese frame permite
// que cloud-relay retome el request persistido en sessionStorage.
const CLOUD_RELAY_HOSTS = /(^|\.)(chatgpt\.com|chat\.openai\.com|gemini\.google\.com)$/;
chrome.webNavigation.onHistoryStateUpdated.addListener(async details => {
  let host = '';
  try { host = new URL(details.url).hostname; } catch { return; }
  if (!CLOUD_RELAY_HOSTS.test(host)) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      files: ['content-scripts/cloud-relay.js'],
    });
  } catch (error) {
    console.debug('[BG] cloud relay SPA reinjection skipped:', error?.message || error);
  }
});

// ─── Tab Observer ─────────────────────────────────────────
// Detecta cambio de tab y notifica al servidor con info de la nueva tab activa.

function classifyTab(url) {
  if (!url) return { tipo: 'desconocido', esYoutube: false, esVideo: false };
  if (url.includes('youtube.com/watch')) return { tipo: 'youtube-video', esYoutube: true, esVideo: true };
  if (url.includes('youtube.com')) return { tipo: 'youtube', esYoutube: true, esVideo: false };
  if (/meet\.google\.com|teams\.microsoft\.com|zoom\.us/.test(url)) return { tipo: 'meeting', esYoutube: false, esVideo: false };
  if (/cart|checkout|product|item|dp\//i.test(url)) return { tipo: 'commerce', esYoutube: false, esVideo: false };
  return { tipo: 'web', esYoutube: false, esVideo: false };
}

async function notifyTabChange(tabId) {
  try {
    let tab;
    if (tabId) {
      tab = await chrome.tabs.get(tabId);
    } else {
      tab = await getActiveUserTab();
    }
    if (!tab || !tab.url || !tab.url.startsWith('http')) return;
    const info = classifyTab(tab.url);
    const payload = {
      tabId:    tab.id,
      url:      tab.url,
      title:    tab.title || '',
      favicon:  tab.favIconUrl || '',
      ...info,
    };
    // Push por WS al servidor
    if (_extWs && _extWs.readyState === 1) {
      _extWs.send(JSON.stringify({ type: 'EXT_TAB_CHANGE', data: payload }));
    }
    // También POST REST como fallback
    fetch(AURORA + '/ext/tab-change', {
      method: 'POST',
      headers: _hdrs(),
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch (_) {}
}

chrome.tabs.onActivated.addListener(({ tabId }) => notifyTabChange(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) notifyTabChange(tabId);
});

// ─── Utilidades ───────────────────────────────────────
const _GENERIC_PATHS = new Set(['/', '/app', '/app/']);

function _isGenericUrl(url) {
  try {
    const { pathname } = new URL(url);
    if (_GENERIC_PATHS.has(pathname) || pathname === '') return true;
    return pathname.split('/').filter(Boolean).length === 0;
  } catch { return true; }
}

// ─── Utilidad: obtener pestaña activa del usuario ─────
async function getActiveUserTab() {
  const allWins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const isUserTab = t => t?.id && /^https?:\/\//.test(t.url || '');
  for (const win of allWins) {
    if (win.focused) {
      const tab = win.tabs.find(t => t.active && isUserTab(t));
      if (tab) return tab;
      const recent = win.tabs
        .filter(isUserTab)
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
      if (recent) return recent;
    }
  }
  const tabs = await chrome.tabs.query({ active: true });
  return tabs.find(isUserTab)
    || (await chrome.tabs.query({})).filter(isUserTab).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]
    || null;
}

// ─── PORT CONNECTIONS (persistent, keeps SW alive) ────────
chrome.runtime.onConnect.addListener(port => {
  if (port.name === 'proxy-fetch') {
    port.onMessage.addListener(async (msg) => {
      if (msg.type !== 'PROXY_FETCH') return;
      const key = msg.key || ('pf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
      const url = AURORA + msg.path;
      const opts = {
        method: msg.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
      };
      if (msg.body) opts.body = JSON.stringify(msg.body);
      try {
        const r = await fetch(url, opts);
        const d = await r.json();
        // Store result in chrome.storage so content script can poll
        await chrome.storage.local.set({ [key]: { ok: true, data: d } });
        // Also try sending via port (may fail if SW about to die)
        try { port.postMessage({ ok: true, data: d }); } catch {}
      } catch (err) {
        await chrome.storage.local.set({ [key]: { ok: false, error: err.message } });
        try { port.postMessage({ ok: false, error: err.message }); } catch {}
      }
    });
  }
});

// ─── MENSAJES ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── LLM_SESSION_URL ────────────────────────────────────
  // session-sniffer.js (iframes de LLM cloud): persiste la última URL de
  // conversación por host — Aurora restaura ese hilo al reabrir LLM Cloud.
  if (msg.type === 'LLM_SESSION_URL') {
    try {
      const host = new URL(msg.url).host;
      // _ensureToken(): el SW MV3 despierta por este mensaje con _auroraToken
      // en null — _hdrs() directo mandaría el PUT sin Bearer → 401 silencioso.
      _ensureToken().then(() => fetch(AURORA + '/db/llm/history', {
        method: 'PUT',
        headers: _hdrs(),
        body: JSON.stringify({ slot: 'sniffer', ai_id: host, url: msg.url }),
      })).catch(() => {});
    } catch (_) {}
    return;
  }

  // ── AIHUB_PROTOCOL_RUN ─────────────────────────────────
  // Fallback desde content scripts dentro de iframes cloud:
  // iframe → runtime → sidepanel. Mantiene postMessage como camino principal.
  if (msg.type === 'AIHUB_PROTOCOL_RUN') {
    chrome.runtime.sendMessage(Object.assign({}, msg.payload || {}, {
      type: 'PROTOCOL_RUN',
      via:  'runtime',
      tabId: sender?.tab?.id || null,
      frameId: sender?.frameId ?? null
    })).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'AIHUB_DELIVER_RESULT_TO_TAB') {
    const tabId = Number(msg.tabId);
    const frameId = msg.frameId === null || msg.frameId === undefined ? undefined : Number(msg.frameId);
    if (!tabId || !msg.text) {
      sendResponse({ ok: false, error: 'missing_tabId_or_text' });
      return true;
    }
    const options = frameId === undefined ? undefined : { frameId };
    chrome.tabs.sendMessage(tabId, {
      type: 'AIHUB_DELIVER_RESULT',
      text: msg.text,
      requestId: msg.requestId,
    }, options, (res) => {
      const err = chrome.runtime.lastError;
      if (err) sendResponse({ ok: false, error: err.message });
      else sendResponse(res || { ok: true });
    });
    return true;
  }

  // ── NEXUS_STATUS ─────────────────────────────────────
  if (msg.type === 'NEXUS_STATUS') {
    fetch(AURORA + '/health', { signal: AbortSignal.timeout(2000) })
      .then(r => r.json())
      .then(d => sendResponse({ online: true, workspace: d.workspace, os: d.os, shell: d.shell, ext: d.ext }))
      .catch(() => sendResponse({ online: false }));
    return true;
  }

  // ── NEXUS_EXECUTE ─────────────────────────────────────
  // Endpoint real del server: POST /nexus/shell/run {cmd, cwd}
  // (el viejo /nexus/run-shell no existe en aurora v2).
  if (msg.type === 'NEXUS_EXECUTE') {
    _ensureToken()
      .then(() => fetch(AURORA + '/nexus/shell/run', {
        method:  'POST',
        headers: _hdrs(),
        body: JSON.stringify({
          cmd: msg.command,
          origin: { kind: 'extension', id: 'aihub' },
        }),
        signal: AbortSignal.timeout(35000)
      }))
      .then(r => r.json())
      .then(d => {
        sendResponse({
          success:    d.ok === true,
          stdout:     d.stdout || '',
          stderr:     d.stderr || '',
          returncode: d.code ?? (d.ok ? 0 : 1),
          error:      d.error || ''
        });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── FETCH_URL ─────────────────────────────────────────
  if (msg.type === 'FETCH_URL') {
    fetch(msg.url, { signal: AbortSignal.timeout(12000) })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(text => {
        const clean = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi,   '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 15000);
        sendResponse({ success: true, data: clean });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── PROXY_FETCH via sendMessage (deprecated, kept as fallback) ──
  // NOTE: Primary path is now via chrome.runtime.connect() port (see onConnect above)
  if (msg.type === 'PROXY_FETCH') {
    const url = AURORA + msg.path;
    const opts = {
      method: msg.method || 'POST',
      headers: { 'Content-Type': 'application/json' },
    };
    if (msg.body) opts.body = JSON.stringify(msg.body);
    fetch(url, opts)
      .then(r => r.json())
      .then(d => sendResponse({ ok: true, data: d }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── LIST_TABS ─────────────────────────────────────────
  if (msg.type === 'LIST_TABS') {
    chrome.tabs.query({}, tabs => {
      sendResponse({
        success: true,
        tabs: tabs.map(t => ({ id: t.id, title: t.title || '', url: t.url || '', active: t.active }))
      });
    });
    return true;
  }

  // ── GET_ACTIVE_TAB ────────────────────────────────────
  if (msg.type === 'GET_ACTIVE_TAB') {
    getActiveUserTab()
      .then(tab => tab
        ? sendResponse({ success: true, tab: { id: tab.id, url: tab.url, title: tab.title } })
        : sendResponse({ success: false, error: 'No hay pestaña activa' }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── CAPTURE_ACTIVE_TAB ────────────────────────────────
  if (msg.type === 'CAPTURE_ACTIVE_TAB') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No se encontró pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Clona un elemento y elimina nav/header/footer/aside/script/style del clon
            function cleanText(el) {
              if (!el) return '';
              const clone = el.cloneNode(true);
              clone.querySelectorAll('nav, header, footer, aside, script, style, noscript, [role="navigation"], [role="banner"]').forEach(n => n.remove());
              return (clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
            }
            // Prioridad: LLM chat > artículo > main > body
            const selectors = [
              '[data-message-author-role]', '.message-content', '.font-claude-message',
              '.prose', 'article', '[role="main"]', 'main', 'body'
            ];
            const getText = () => {
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                const t = cleanText(el);
                if (t.length > 200) return t;
              }
              return cleanText(document.body);
            };
            const text = getText();
            if (location.hostname.includes('youtube.com')) {
              const segmentCount = document.querySelectorAll('ytd-transcript-segment-renderer').length;
              const timestampCount = (text.match(/\b\d{1,2}:\d{2}\b/g) || []).length;
              const transcriptOpen = /(^|\n)\s*Transcripci[oó]n\s*(\n|$)/i.test(text)
                || !!document.querySelector('[aria-label*="Cerrar transcripci"], [aria-label*="Cerrar transcripción"]');
              if (transcriptOpen && segmentCount === 0 && timestampCount < 3) {
                return [
                  '⚠ Diagnóstico YouTube: el panel de transcripción parece abierto, pero NO hay segmentos/timestamps legibles todavía. No trates esto como transcripción extraída; espera, haz scroll/click dentro del panel, cambia de video o reporta bloqueo.',
                  '',
                  text
                ].join('\n');
              }
              if (segmentCount > 0) {
                return [
                  `✓ Diagnóstico YouTube: ${segmentCount} segmentos de transcripción detectados.`,
                  '',
                  text
                ].join('\n');
              }
            }
            return text;
          }
        });
        const text = result[0].result;
        const tabInfo = { title: tab.title, url: tab.url };
        // Push al servidor para procesamiento/historial
        await _ensureToken();
        fetch(AURORA + '/ext/capture', {
          method: 'POST',
          headers: _hdrs(),
          body: JSON.stringify({ tipo: 'page', content: text, tab: tabInfo, ts: Date.now() }),
        }).catch(() => {});
        sendResponse({ success: true, data: text, tab: tabInfo });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── EXTRACT_PRODUCTS_ACTIVE_TAB ─────────────────────────
  // Extrae tarjetas de producto de una página de compras/listados.
  if (msg.type === 'EXTRACT_PRODUCTS_ACTIVE_TAB') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No se encontró pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const text = el => (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
            const href = el => {
              const raw = el?.href || el?.getAttribute?.('href') || '';
              if (!raw) return '';
              try { return new URL(raw, location.href).href; } catch { return raw; }
            };
            const priceOf = root => {
              const whole = root.querySelector('.a-price .a-price-whole, [class*="price-whole"]');
              const frac  = root.querySelector('.a-price .a-price-fraction, [class*="price-fraction"]');
              const offscreen = root.querySelector('.a-price .a-offscreen, [class*="price"] .a-offscreen');
              if (offscreen) return text(offscreen);
              if (whole) return `$${text(whole).replace(/[^\d.,]/g, '')}${frac ? '.' + text(frac).replace(/[^\d]/g, '') : ''}`;
              const raw = text(root).match(/\$\s?\d+(?:[.,]\d{2})?/);
              return raw ? raw[0].replace(/\s+/g, '') : '';
            };
            const ratingOf = root => {
              const aria = root.querySelector('[aria-label*="out of"], [aria-label*="estrellas"], [aria-label*="stars"]')?.getAttribute('aria-label');
              if (aria) return aria;
              const txt = text(root).match(/\d(?:\.\d)?\s*out of\s*5/i);
              return txt ? txt[0] : '';
            };
            const selectors = [
              '[data-component-type="s-search-result"]',
              '[data-testid*="product"]',
              '[class*="product"]',
              'article',
            ];
            let cards = [];
            for (const selector of selectors) {
              cards = [...document.querySelectorAll(selector)].filter(el => text(el).length > 40);
              if (cards.length) break;
            }
            const products = cards.slice(0, 25).map((card, index) => {
              const titleEl = card.querySelector('h2 a span, h2 span, [data-cy="title-recipe"] span, a[title], a');
              const linkEl  = card.querySelector('h2 a, a[href]');
              const name    = text(titleEl) || titleEl?.getAttribute?.('title') || '';
              return {
                index: index + 1,
                name,
                price: priceOf(card),
                rating: ratingOf(card),
                url: href(linkEl),
              };
            }).filter(p => p.name || p.price);
            return {
              title: document.title,
              url: location.href,
              count: products.length,
              products,
            };
          }
        });
        sendResponse({ success: true, data: result[0].result, tab: { title: tab.title, url: tab.url } });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── LAB_YOUTUBE_TRANSCRIPT_HUMAN ────────────────────────
  // Herramienta de laboratorio: emula el flujo humano de YouTube
  // Info → scroll panel → Mostrar transcripción → leer segmentos.
  // No se expone a Lyra en tools-definiciones.js.
  if (msg.type === 'LAB_YOUTUBE_TRANSCRIPT_HUMAN') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No se encontró pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async (opts = {}) => {
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            const norm = value => String(value || '').replace(/\s+/g, ' ').trim();
            const isVisible = el => {
              if (!el) return false;
              const r = el.getBoundingClientRect();
              const style = getComputedStyle(el);
              return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
                r.top < innerHeight && r.left < innerWidth &&
                style.visibility !== 'hidden' && style.display !== 'none';
            };
            const labelOf = el => norm(`${el?.textContent || ''} ${el?.getAttribute?.('aria-label') || ''} ${el?.getAttribute?.('title') || ''}`);
            const clickHuman = async (el, label) => {
              if (!el) return false;
              el.scrollIntoView({ block: 'center', inline: 'center' });
              await wait(180);
              const r = el.getBoundingClientRect();
              const x = Math.max(1, Math.min(innerWidth - 1, r.left + r.width / 2));
              const y = Math.max(1, Math.min(innerHeight - 1, r.top + r.height / 2));
              for (const type of ['pointerover', 'mouseover', 'pointermove', 'mousemove', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
                const Ctor = type.startsWith('pointer') ? PointerEvent : MouseEvent;
                el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
              }
              steps.push(`${label}: click (${Math.round(x)},${Math.round(y)})`);
              await wait(700);
              return true;
            };
            const collectSegments = () => {
              const nodes = [...document.querySelectorAll('ytd-transcript-segment-renderer')];
              return nodes.map((el, index) => ({
                index: index + 1,
                time: norm(el.querySelector('.segment-timestamp, .segment-start-offset')?.textContent),
                text: norm(el.querySelector('.segment-text')?.textContent || el.textContent.replace(/^\s*\d+:\d+\s*/, ''))
              })).filter(s => s.text && s.text !== s.time);
            };
            const findTranscriptButton = () => [...document.querySelectorAll('button,tp-yt-paper-button,[role="button"]')]
              .find(el => /mostrar transcripci[oó]n|show transcript/i.test(labelOf(el)) && isVisible(el));
            const findInfoTab = () => [...document.querySelectorAll('a,button,[role="button"]')]
              .find(el => /^(info|informaci[oó]n)$/i.test(norm(el.textContent || el.getAttribute?.('aria-label'))) && isVisible(el));
            const findTranscriptPanelScroller = () => [...document.querySelectorAll('*')]
              .filter(el => el.scrollHeight > el.clientHeight + 40)
              .find(el => /mostrar transcripci[oó]n|show transcript|transcripci[oó]n/i.test(el.innerText || '') && el.getBoundingClientRect().right > innerWidth * 0.35);

            const steps = [];
            const startedAt = Date.now();
            if (!/youtube\.com\/watch/.test(location.href)) {
              return { ok: false, error: 'La pestaña activa no es un video de YouTube.', url: location.href, title: document.title, steps };
            }

            let segments = collectSegments();
            if (segments.length) {
              return { ok: true, source: 'already-open', url: location.href, title: document.title, segments, segmentCount: segments.length, steps };
            }

            let button = findTranscriptButton();
            if (!button) {
              const info = findInfoTab();
              if (info) await clickHuman(info, 'abrir Info');
              else steps.push('abrir Info: no se encontró tab visible');
            }

            for (let attempt = 0; attempt < 8; attempt++) {
              button = findTranscriptButton();
              if (button) break;

              const scroller = findTranscriptPanelScroller();
              if (scroller) {
                const before = scroller.scrollTop;
                scroller.scrollTop = Math.min(scroller.scrollHeight, scroller.scrollTop + Math.max(260, scroller.clientHeight * 0.65));
                steps.push(`scroll panel transcript (${Math.round(before)} → ${Math.round(scroller.scrollTop)})`);
              } else {
                const before = scrollY;
                scrollBy(0, Math.max(350, innerHeight * 0.55));
                steps.push(`scroll página (${Math.round(before)} → ${Math.round(scrollY)})`);
              }
              await wait(450);
            }

            button = findTranscriptButton();
            if (!button) {
              return { ok: false, error: 'No se encontró botón visible "Mostrar transcripción".', url: location.href, title: document.title, steps, bodyPreview: document.body.innerText.slice(0, 2500) };
            }

            await clickHuman(button, 'mostrar transcripción');

            for (let i = 0; i < 15; i++) {
              await wait(500);
              segments = collectSegments();
              if (segments.length) break;
            }

            const panel = [...document.querySelectorAll('ytd-engagement-panel-section-list-renderer')]
              .find(p => /transcripci[oó]n|transcript/i.test(p.innerText || '') && p.getAttribute('visibility')?.includes('EXPANDED'));
            return {
              ok: segments.length > 0,
              error: segments.length ? '' : 'Se abrió el panel, pero no aparecieron segmentos de transcripción.',
              url: location.href,
              title: document.title,
              source: 'human-dom',
              segmentCount: segments.length,
              segments: segments.slice(0, Math.max(1, Number(opts.maxSegments) || 120)),
              panelPreview: norm(panel?.innerText || '').slice(0, 4000),
              steps,
              elapsedMs: Date.now() - startedAt
            };
          },
          args: [msg.options || {}]
        });
        sendResponse({ success: true, data: result[0].result, tab: { title: tab.title, url: tab.url } });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── CAPTURE_FRAME ─────────────────────────────────────
  if (msg.type === 'CAPTURE_FRAME') {
    chrome.tabs.captureVisibleTab({ format: 'png' })
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(err  => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── REINJECT_YT_CS ───────────────────────────────────────
  if (msg.type === 'REINJECT_YT_CS') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url?.includes('youtube.com')) { sendResponse({ ok: false, error: 'no-youtube' }); return; }
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/yt-captures.js'],
          world: 'ISOLATED',
        });
        sendResponse({ ok: true });
      } catch (err) { sendResponse({ ok: false, error: err.message }); }
    })();
    return true;
  }

  // ── CHECK_YT_CS ──────────────────────────────────────────
  if (msg.type === 'CHECK_YT_CS') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url?.includes('youtube.com')) { sendResponse({ alive: false }); return; }
        const result = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        sendResponse({ alive: !!result?.alive });
      } catch (err) { sendResponse({ alive: false }); }
    })();
    return true;
  }

  // ── CAPTURE_YOUTUBE (proxy a yt-captures.js) ───────────
  if (msg.type === 'CAPTURE_YOUTUBE') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { sendResponse({ success: false, error: 'No active tab' }); return; }
        if (!tab.url?.includes('youtube.com/watch')) { sendResponse({ success: false, error: 'not-youtube' }); return; }

        // sendMessage con timeout corto (chrome default ~30s sin el)
        const sendWithTimeout = (t, m, ms = 20000) => new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Receiving end does not exist (timeout)')), ms);
          chrome.tabs.sendMessage(t, m, (r) => {
            clearTimeout(timer);
            const err = chrome.runtime.lastError;
            if (err) reject(new Error(err.message));
            else resolve(r);
          });
        });

        let result;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await sendWithTimeout(tab.id, { action: 'extractData', type: msg.extractionType || 'withoutTimestamps' });
            if (result && (result.success || result.content)) break;
            throw new Error(result?.error || 'Content script no respondio');
          } catch (err) {
            if (attempt < 1 && err.message?.includes?.('Receiving end')) {
              try {
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ['content-scripts/yt-captures.js'],
                });
              } catch (_) {}
              await new Promise(r => setTimeout(r, 800));
              continue;
            }
            throw err;
          }
        }

        sendResponse(result || { success: false, error: 'Content script no respondio tras reintentos' });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── RUN_JS ────────────────────────────────────────────
  if (msg.type === 'RUN_JS') {
    (async () => {
      try {
        if (!msg.code) { sendResponse({ success: false, error: 'Código vacío' }); return; }
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'ISOLATED',
          func: (code) => {
            try { return String(eval(code) ?? '(sin valor)'); }
            catch (e) { return 'Error: ' + e.message; }
          },
          args: [msg.code]
        });
        sendResponse({ success: true, result: result[0]?.result ?? '(sin resultado)' });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── INSPECT_PAGE ──────────────────────────────────────
  if (msg.type === 'INSPECT_PAGE') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const out = { url: location.href, title: document.title, forms: [], buttons: [] };
            document.querySelectorAll('form').forEach((form, fi) => {
              const fData = {
                selector: form.id ? `#${form.id}` : `form:nth-of-type(${fi + 1})`,
                fields: [], submit_buttons: []
              };
              form.querySelectorAll('input:not([type=hidden]),textarea,select').forEach(f => {
                let label = '';
                if (f.id) { const lbl = document.querySelector(`label[for="${f.id}"]`); if (lbl) label = lbl.textContent.trim(); }
                if (!label) label = f.placeholder || f.name || f.id || '';
                fData.fields.push({ type: f.type || f.tagName.toLowerCase(), name: f.name || '', id: f.id || '',
                  label: label.slice(0, 60), required: f.required, value: f.value || '',
                  selector: f.id ? `#${f.id}` : (f.name ? `[name="${f.name}"]` : '') });
              });
              form.querySelectorAll('[type=submit]').forEach(btn => {
                fData.submit_buttons.push({ text: btn.textContent.trim().slice(0, 40), selector: btn.id ? `#${btn.id}` : '[type=submit]' });
              });
              out.forms.push(fData);
            });
            document.querySelectorAll('button,[role=button]').forEach((btn, i) => {
              if (i >= 10) return;
              const text = btn.textContent.trim().slice(0, 40);
              if (text) out.buttons.push({ text, id: btn.id || '' });
            });
            return out;
          }
        });
        sendResponse({ success: true, data: result[0]?.result });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── SMART_FILL_FORM ───────────────────────────────────
  if (msg.type === 'SMART_FILL_FORM') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (formSel, data) => {
            const form = formSel ? document.querySelector(formSel) : document.querySelector('form');
            if (!form) return { ok: false, msg: 'No se encontró formulario' };
            const nativeSet = proto => Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            const inputSet    = nativeSet(window.HTMLInputElement.prototype);
            const textareaSet = nativeSet(window.HTMLTextAreaElement.prototype);
            const filled = [], failed = [];
            Object.entries(data).forEach(([key, value]) => {
              let el = form.querySelector(`[name="${key}"]`) || form.querySelector(`#${key}`);
              if (!el) { failed.push(key); return; }
              const setter = el.tagName === 'TEXTAREA' ? textareaSet : inputSet;
              if (setter) setter.call(el, String(value)); else el.value = String(value);
              el.dispatchEvent(new Event('input',  { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              filled.push(key);
            });
            return { ok: true, msg: `✓ ${filled.join(', ')}${failed.length ? ` | ⚠ no encontrados: ${failed.join(', ')}` : ''}` };
          },
          args: [msg.form_selector || '', msg.data || {}]
        });
        const r = result[0]?.result;
        sendResponse(r?.ok ? { success: true, result: r.msg } : { success: false, error: r?.msg });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── SCREENSHOT_WITH_MAP ───────────────────────────────
  if (msg.type === 'SCREENSHOT_WITH_MAP') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const [mapResult, screenshot] = await Promise.all([
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const seen = new Set(), els = [];
              document.querySelectorAll('a[href],button,input:not([type=hidden]),textarea,select,[role=button]')
                .forEach((el, i) => {
                  if (i >= 25) return;
                  const rect = el.getBoundingClientRect();
                  if (!rect.width || !rect.height) return;
                  const key = `${Math.round(rect.x)},${Math.round(rect.y)}`;
                  if (seen.has(key)) return; seen.add(key);
                  els.push({ tag: el.tagName.toLowerCase(), type: el.type || '',
                    text: (el.textContent?.trim() || el.value || el.placeholder || '').slice(0, 30),
                    selector: el.id ? `#${el.id}` : (el.name ? `[name="${el.name}"]` : ''),
                    x: Math.round(rect.x), y: Math.round(rect.y) });
                });
              return els;
            }
          }),
          chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
        ]);
        sendResponse({ success: true, screenshot, elements: mapResult[0]?.result || [] });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── VISUAL_OBSERVE_ACTIVE_TAB ─────────────────────────
  // Captura pasiva de lo visible. No inyecta DOM, no usa debugger,
  // no cambia métricas de viewport y no dibuja overlays.
  if (msg.type === 'VISUAL_OBSERVE_ACTIVE_TAB') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        sendResponse({
          success: true,
          screenshot,
          tab: { id: tab.id, title: tab.title, url: tab.url }
        });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── CLICK_ELEMENT ─────────────────────────────────────
  if (msg.type === 'CLICK_ELEMENT') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (selector, text) => {
            let el = selector ? document.querySelector(selector) : null;
            if (!el && text) el = [...document.querySelectorAll('a,button,[role=button]')].find(e =>
              e.textContent.trim().toLowerCase().includes(text.toLowerCase()));
            if (!el) return { ok: false, msg: `Elemento no encontrado` };
            el.click();
            return { ok: true, msg: `✓ Clic en ${el.tagName.toLowerCase()}${el.id ? '#'+el.id : ''}` };
          },
          args: [msg.selector || '', msg.text || '']
        });
        const r = result[0]?.result;
        sendResponse(r?.ok ? { success: true, result: r.msg } : { success: false, error: r?.msg });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── FILL_INPUT ────────────────────────────────────────
  if (msg.type === 'FILL_INPUT') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (selector, value, submit) => {
            const el = document.querySelector(selector);
            if (!el) return { ok: false, msg: `Campo no encontrado: ${selector}` };
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
              || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            if (setter) setter.call(el, value); else el.value = value;
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (submit) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            return { ok: true, msg: `✓ "${value.slice(0,30)}" → ${selector}` };
          },
          args: [msg.selector, msg.value, !!msg.submit]
        });
        const r = result[0]?.result;
        sendResponse(r?.ok ? { success: true, result: r.msg } : { success: false, error: r?.msg });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── NAVIGATE_TO ───────────────────────────────────────
  if (msg.type === 'NAVIGATE_TO') {
    (async () => {
      try {
        if (msg.new_tab) {
          await chrome.tabs.create({ url: msg.url });
        } else {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tabs[0]) await chrome.tabs.update(tabs[0].id, { url: msg.url });
        }
        sendResponse({ success: true, result: `✓ Navegando a ${msg.url}` });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── GET_PAGE_LINKS ────────────────────────────────────
  if (msg.type === 'GET_PAGE_LINKS') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (filter) => {
            const links = [...document.querySelectorAll('a[href]')]
              .map(a => ({ href: a.href, text: a.textContent.trim().slice(0, 80) }))
              .filter(l => l.href && !l.href.startsWith('javascript:'))
              .filter(l => !filter || l.href.includes(filter));
            const unique = [...new Map(links.map(l => [l.href, l])).values()];
            return unique.slice(0, 100).map(l => `${l.text || '(sin texto)'}\n  ${l.href}`).join('\n');
          },
          args: [msg.filter || '']
        });
        sendResponse({ success: true, result: result[0]?.result || '(sin enlaces)' });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── FIND_ON_PAGE ──────────────────────────────────────
  if (msg.type === 'FIND_ON_PAGE') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (query) => {
            const text = document.body.innerText || '', lower = text.toLowerCase(), q = query.toLowerCase();
            const hits = [];
            let idx = 0;
            while ((idx = lower.indexOf(q, idx)) !== -1 && hits.length < 5) {
              hits.push('…' + text.slice(Math.max(0, idx-80), idx+query.length+80).replace(/\n+/g, ' ') + '…');
              idx += q.length;
            }
            return hits.length ? `${hits.length} resultado(s):\n\n` + hits.join('\n\n') : null;
          },
          args: [msg.query]
        });
        sendResponse({ success: true, result: result[0]?.result || `No se encontró "${msg.query}"` });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── GET_SELECTED_TEXT ─────────────────────────────────
  if (msg.type === 'GET_SELECTED_TEXT') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.getSelection()?.toString() || ''
        });
        sendResponse({ success: true, result: result[0]?.result || '' });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── SCROLL_PAGE ───────────────────────────────────────
  if (msg.type === 'SCROLL_PAGE') {
    (async () => {
      try {
        const tab = await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }
        const result = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (direction, amount) => {
            const docEl = document.scrollingElement || document.documentElement || document.body;
            const before = {
              windowY: Math.round(window.scrollY || docEl.scrollTop || 0),
              docTop: Math.round(docEl.scrollTop || 0),
            };

            const canScroll = el => {
              if (!el) return false;
              const style = getComputedStyle(el);
              return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 4;
            };
            const center = document.elementFromPoint(window.innerWidth * 0.62, window.innerHeight * 0.55);
            const chain = [];
            for (let el = center; el; el = el.parentElement) chain.push(el);
            const candidates = [
              ...chain.filter(canScroll),
              ...Array.from(document.querySelectorAll('*')).filter(canScroll).sort((a, b) =>
                (b.clientHeight * b.clientWidth) - (a.clientHeight * a.clientWidth)
              ).slice(0, 5),
              docEl
            ];

            const delta = direction === 'up' ? -amount : amount;
            const applyScroll = el => {
              const start = Math.round(el === docEl ? (window.scrollY || docEl.scrollTop || 0) : el.scrollTop);
              if (direction === 'top') {
                if (el === docEl) window.scrollTo(0, 0);
                else el.scrollTop = 0;
              } else if (direction === 'bottom') {
                if (el === docEl) window.scrollTo(0, docEl.scrollHeight);
                else el.scrollTop = el.scrollHeight;
              } else if (el === docEl) {
                window.scrollBy(0, delta);
              } else {
                el.scrollBy(0, delta);
              }
              const end = Math.round(el === docEl ? (window.scrollY || docEl.scrollTop || 0) : el.scrollTop);
              return { el, start, end, moved: Math.abs(end - start) > 1 };
            };

            let used = null;
            for (const candidate of candidates) {
              used = applyScroll(candidate);
              if (used.moved || direction === 'top' || direction === 'bottom') break;
            }

            const after = {
              windowY: Math.round(window.scrollY || docEl.scrollTop || 0),
              docTop: Math.round(docEl.scrollTop || 0),
            };
            const name = used?.el === docEl ? 'documento' : (used?.el?.tagName?.toLowerCase() || 'contenedor');
            const moved = used?.moved ? `movido ${used.start}→${used.end}` : 'sin desplazamiento visible';
            return `✓ Scroll ${direction}: ${moved} en ${name}. windowY ${before.windowY}→${after.windowY}`;
          },
          args: [msg.direction || 'down', msg.amount || 500]
        });
        sendResponse({ success: true, result: result[0]?.result });
      } catch (err) { sendResponse({ success: false, error: err.message }); }
    })();
    return true;
  }

  // ── DETECT_LLM_META ──────────────────────────────────
  // Obtiene nombre y favicon de una URL sin restricciones CORS.
  // msg: { type, url }
  if (msg.type === 'DETECT_LLM_META') {
    (async () => {
      try {
        const url  = msg.url;
        const base = new URL(url);
        const favicon = `https://www.google.com/s2/favicons?domain=${base.hostname}&sz=64`;

        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const html = await r.text();

        // Extraer <title>
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        let name = titleMatch?.[1]?.trim() || '';
        // Limpiar separadores comunes: "YouTube - Home" → "YouTube"
        name = name.split(/\s*[\|\-–—·•]\s*/)[0].trim();
        if (!name) name = base.hostname.replace(/^www\./, '').split('.')[0];
        name = name.charAt(0).toUpperCase() + name.slice(1);

        sendResponse({ success: true, name, icon: favicon });
      } catch (err) {
        try {
          const base    = new URL(msg.url);
          const favicon = `https://www.google.com/s2/favicons?domain=${base.hostname}&sz=64`;
          const name    = base.hostname.replace(/^www\./, '').split('.')[0];
          sendResponse({ success: true, name: name.charAt(0).toUpperCase() + name.slice(1), icon: favicon });
        } catch {
          sendResponse({ success: false, error: err.message });
        }
      }
    })();
    return true;
  }

  // ── DEBUGGER_EVAL ─────────────────────────────────────
  // Ejecuta JS en cualquier pestaña via CDP Runtime.evaluate.
  // msg: { type, tabId?, code, awaitPromise? }
  // Si no se pasa tabId, usa la pestaña activa del usuario.
  if (msg.type === 'DEBUGGER_EVAL') {
    (async () => {
      try {
        const tab = msg.tabId
          ? { id: msg.tabId }
          : await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }

        await chrome.debugger.attach({ tabId: tab.id }, '1.3');

        const result = await chrome.debugger.sendCommand(
          { tabId: tab.id },
          'Runtime.evaluate',
          { expression: msg.code, awaitPromise: !!msg.awaitPromise, returnByValue: true }
        );

        await chrome.debugger.detach({ tabId: tab.id });

        if (result.exceptionDetails) {
          const err = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
          sendResponse({ success: false, error: err });
        } else {
          sendResponse({ success: true, result: result.result?.value ?? '(sin valor)' });
        }
      } catch (err) {
        try { await chrome.debugger.detach({ tabId: msg.tabId }); } catch (_) {}
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ── DEBUG_EXT (CDP) ────────────────────────────────────
  // Diagnóstico completo de la extensión en la pestaña activa.
  if (msg.type === 'DEBUG_EXT') {
    (async () => {
      const steps = [];
      const elapsed = () => Date.now() - t0;
      const t0 = Date.now();
      const add = (ok, label, detail) => steps.push({ ok, label, detail, ms: elapsed() });
      try {
        add(true, 'init', 'DEBUG_EXT iniciado');

        const tab = msg.tabId ? { id: msg.tabId } : await getActiveUserTab();
        if (!tab) { add(false, 'tab', 'No se encontró pestaña activa'); sendResponse({ success: true, debug: { steps } }); return; }
        add(true, 'tab', `id=${tab.id} title="${(tab.title||'').slice(0,60)}"`);

        await chrome.debugger.attach({ tabId: tab.id }, '1.3');
        add(true, 'cdp:attach', `debugger attached`);

        const info = await chrome.debugger.sendCommand(
          { tabId: tab.id },
          'Runtime.evaluate',
          {
            expression: `(function(){
              var r = {};
              r.url = location.href;
              r.host = location.hostname;
              r.ready = document.readyState;
              r.isYT = location.hostname.includes('youtube.com');
              r.isWatch = location.pathname.startsWith('/watch');
              r.videoId = (new URLSearchParams(location.search).get('v')||'').slice(0,20);
              r.title = (document.title||'').slice(0,80);
              r.bodyLen = (document.body?.innerText||'').length;
              r.hasCS = typeof __aurora_yt_cs === 'object' ? 'yt-cs loaded' : (typeof __aurora_yt_cs);
              r.scripts = document.querySelectorAll('script[src*="yt-captures"]').length;
              return r;
            })()`,
            awaitPromise: false,
            returnByValue: true
          }
        );
        add(true, 'cdp:eval', 'Runtime.evaluate ejecutado');

        if (info.exceptionDetails) {
          add(false, 'cdp:result', info.exceptionDetails.exception?.description || info.exceptionDetails.text);
        } else {
          const v = info.result?.value;
          if (v) {
            add(true, 'page', `url="${(v.url||'').slice(0,80)}" ready=${v.ready} bodyLen=${v.bodyLen}`);
            if (v.isYT) add(true, 'yt', `videoId=${v.videoId} isWatch=${v.isWatch} scripts=${v.scripts} cs=${v.hasCS}`);
          }
        }

        await chrome.debugger.detach({ tabId: tab.id });
        add(true, 'cdp:detach', 'debugger detached');
        add(true, 'done', `total ${elapsed()}ms`);
        sendResponse({ success: true, debug: { steps } });
      } catch (err) {
        try { await chrome.debugger.detach({ tabId: msg.tabId }); } catch (_) {}
        add(false, 'error', err.message.slice(0, 200));
        sendResponse({ success: true, debug: { steps } });
      }
    })();
    return true;
  }

  // ── DEBUG_SIDEPANEL (CDP) ──────────────────────────────
  // Lee logs del bridge desde el sidepanel via CDP.
  if (msg.type === 'DEBUG_SIDEPANEL') {
    (async () => {
      const steps = [];
      const add = (ok, label, detail) => steps.push({ ok, label, detail });
      try {
        const tabs = await chrome.tabs.query({ url: 'chrome-extension://*/sidepanel.html' });
        if (!tabs?.length) { add(false, 'sidepanel', 'No se encontró sidepanel'); sendResponse({ success: true, debug: { steps } }); return; }
        const tab = tabs[0];
        add(true, 'sidepanel', `id=${tab.id} title="${(tab.title||'').slice(0,50)}"`);

        await chrome.debugger.attach({ tabId: tab.id }, '1.3');
        add(true, 'attach', 'debugger attached to sidepanel');

        const result = await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.evaluate', {
          expression: `(function(){
            var logs = window.__aurora_bridgeLog || [];
            var lastN = logs.slice(-30);
            var iframeOk = !!document.querySelector('iframe');
            var iframeSrc = document.querySelector('iframe')?.src || '';
            return {
              sidepanelUrl: location.href,
              iframe: iframeSrc,
              logCount: logs.length,
              recent: lastN.map(function(l){ return {t:l.t,type:l.type,detail:l.detail}; })
            };
          })()`,
          returnByValue: true,
          awaitPromise: false,
        });

        if (result.exceptionDetails) {
          add(false, 'eval', result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        } else {
          const v = result.result?.value;
          if (v) {
            add(true, 'info', `iframe=${v.iframe} logCount=${v.logCount}`);
            for (const entry of (v.recent || [])) {
              add(true, 'log', `${entry.type} ${JSON.stringify(entry.detail||{}).slice(0,150)}`);
            }
          }
        }

        await chrome.debugger.detach({ tabId: tab.id });
        add(true, 'detach', 'debugger detached');
        sendResponse({ success: true, debug: { steps } });
      } catch (err) {
        try { await chrome.debugger.detach({ tabId: msg.tabId }); } catch (_) {}
        add(false, 'error', err.message.slice(0, 200));
        sendResponse({ success: true, debug: { steps } });
      }
    })();
    return true;
  }

  // ── DEBUG_YOUTUBE (CDP) ─────────────────────────────────
  if (msg.type === 'DEBUG_YOUTUBE') {
    (async () => {
      try {
        const tab = msg.tabId ? { id: msg.tabId } : await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }

        await chrome.debugger.attach({ tabId: tab.id }, '1.3');

        const result = await chrome.debugger.sendCommand(
          { tabId: tab.id },
          'Runtime.evaluate',
          {
            expression: `(async function(){
              var r = {};
              r.url = window.location.href;
              r.videoId = new URLSearchParams(window.location.search).get('v') || '';
              r.title = (document.title||'').slice(0,80);
              r.readyState = document.readyState;
              r.isYouTube = window.location.hostname.includes('youtube.com');
              r.isWatch = window.location.pathname.startsWith('/watch');
              return r;
            })()`,
            awaitPromise: true,
            returnByValue: true
          }
        );

        await chrome.debugger.detach({ tabId: tab.id });

        if (result.exceptionDetails) {
          sendResponse({ success: false, error: result.exceptionDetails.exception?.description || result.exceptionDetails.text });
        } else {
          sendResponse({ success: true, debug: result.result?.value });
        }
      } catch (err) {
        try { await chrome.debugger.detach({ tabId: msg.tabId }); } catch (_) {}
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ── DEBUGGER_SCREENSHOT ───────────────────────────────
  // Captura screenshot via CDP — funciona aunque la pestaña no sea visible.
  // msg: { type, tabId?, format? }
  if (msg.type === 'DEBUGGER_SCREENSHOT') {
    (async () => {
      try {
        const tab = msg.tabId
          ? { id: msg.tabId }
          : await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }

        await chrome.debugger.attach({ tabId: tab.id }, '1.3');

        const result = await chrome.debugger.sendCommand(
          { tabId: tab.id },
          'Page.captureScreenshot',
          { format: msg.format || 'png', quality: 80 }
        );

        await chrome.debugger.detach({ tabId: tab.id });

        sendResponse({ success: true, dataUrl: `data:image/png;base64,${result.data}` });
      } catch (err) {
        try { await chrome.debugger.detach({ tabId: msg.tabId }); } catch (_) {}
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // ── DEBUGGER_GET_CONSOLE ──────────────────────────────
  // Inyecta un override de console.log/warn/error en la pestaña y
  // captura los mensajes emitidos durante N ms.
  // msg: { type, tabId?, durationMs? }
  if (msg.type === 'DEBUGGER_GET_CONSOLE') {
    (async () => {
      try {
        const tab = msg.tabId
          ? { id: msg.tabId }
          : await getActiveUserTab();
        if (!tab) { sendResponse({ success: false, error: 'No hay pestaña activa' }); return; }

        const duration = msg.durationMs ?? 3000;
        const logs = [];

        await chrome.debugger.attach({ tabId: tab.id }, '1.3');
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Runtime.enable');
        await chrome.debugger.sendCommand({ tabId: tab.id }, 'Log.enable');

        const onEvent = (source, method, params) => {
          if (source.tabId !== tab.id) return;
          if (method === 'Runtime.consoleAPICalled') {
            const text = params.args?.map(a => a.value ?? a.description ?? '').join(' ') || '';
            logs.push({ type: params.type, text, timestamp: params.timestamp });
          }
          if (method === 'Log.entryAdded') {
            logs.push({ type: params.entry.level, text: params.entry.text, timestamp: Date.now() });
          }
        };

        chrome.debugger.onEvent.addListener(onEvent);

        await new Promise(r => setTimeout(r, duration));

        chrome.debugger.onEvent.removeListener(onEvent);
        await chrome.debugger.detach({ tabId: tab.id });

        sendResponse({ success: true, logs });
      } catch (err) {
        try { await chrome.debugger.detach({ tabId: msg.tabId }); } catch (_) {}
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'CLIPBOARD_WRITE') {
    (async () => {
      try {
        await navigator.clipboard.writeText(msg.text || '');
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.type === 'CLIPBOARD_READ') {
    (async () => {
      try {
        const text = await navigator.clipboard.readText();
        sendResponse({ ok: true, text });
      } catch (err) {
        sendResponse({ ok: false, error: err.message, text: '' });
      }
    })();
    return true;
  }

  if (msg.type === 'AURORA_INJECT_TEXT_TAB') {
    (async () => {
      try {
        const tabId = msg.tabId;
        const res = await chrome.tabs.sendMessage(tabId, {
          type: 'AURORA_INJECT_TEXT',
          text: msg.text,
          send: msg.send || false,
        });
        sendResponse(res || { ok: true });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // ── OPEN_SIDEPANEL ──────────────────────────────────────
  if (msg.type === 'OPEN_SIDEPANEL') {
    chrome.sidePanel.open({ windowId: msg.windowId }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  // ── BOLD (Neural HUD) ──────────────────────────────────
  if (msg.type === 'AURORA_BOLD_GET_CONFIG') {
    _ensureToken()
      .then(() => fetch(AURORA + '/db/extensions/bold', { headers: _hdrs() }))
      .then(r => r.json())
      .then(d => sendResponse({ ok: true, config: d.config || {} }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'AURORA_BOLD_SET_CONFIG') {
    _ensureToken()
      .then(() => fetch(AURORA + '/db/extensions/bold', {
        method: 'PUT',
        headers: _hdrs(),
        body: JSON.stringify({ enabled: msg.enabled !== false, config: msg.config || {} }),
      }))
      .then(r => r.json())
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── DOWNLOAD_INSTRUCTION ────────────────────────────────
  if (msg.action === 'download_instruction') {
    handleDownload(msg, sendResponse);
    return true;
  }

  // ── YOUTUBE CAPTURES (proxy to yt-captures.js content script) ──
  if (msg.action === 'extractData') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { sendResponse({ success: false, error: 'No active tab' }); return; }
        const result = await chrome.tabs.sendMessage(tab.id, msg);
        sendResponse(result || { success: false, error: 'Content script no respondio' });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === 'checkTranscript') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) { sendResponse({ available: false, error: 'No active tab' }); return; }
        const result = await chrome.tabs.sendMessage(tab.id, msg);
        sendResponse(result || { available: false, error: 'Content script no respondio' });
      } catch (err) {
        sendResponse({ available: false, error: err.message });
      }
    })();
    return true;
  }

  sendResponse({ error: 'Mensaje desconocido: ' + msg.type });
  return true;
});

// ─── Limpiar caché antigua al iniciar ─────────────────
chrome.runtime.onStartup.addListener(async () => {
  const storage = await chrome.storage.local.get(null);
  const cutoff  = Date.now() - 7 * 24 * 60 * 60 * 1000;
  Object.keys(storage).forEach(key => {
    if (key.startsWith('yt_cache_') && storage[key]?.timestamp < cutoff) {
      chrome.storage.local.remove(key);
    }
  });
});
