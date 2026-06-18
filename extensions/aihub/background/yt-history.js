const HISTORY_KEY = 'ytExtractionHistory';
const MAX_HISTORY = 50;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([HISTORY_KEY], (res) => {
    if (!res[HISTORY_KEY]) chrome.storage.local.set({ [HISTORY_KEY]: [] });
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  if (msg.action === 'saveToHistory')  { saveHistory(msg.data).then(sendResponse); return true; }
  if (msg.action === 'getHistory')     { getHistory().then(sendResponse); return true; }
  if (msg.action === 'getFromHistory') {
    getHistory().then(res => {
      const entry = (res.history || []).find(i => i.videoId === msg.videoId);
      sendResponse({ success: !!entry, data: entry });
    });
    return true;
  }
  if (msg.action === 'clearHistory') {
    chrome.storage.local.set({ [HISTORY_KEY]: [] })
      .then(() => sendResponse({ success: true }))
      .catch(e  => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

async function getHistory() {
  try {
    const r = await chrome.storage.local.get([HISTORY_KEY]);
    return { success: true, history: r[HISTORY_KEY] || [] };
  } catch (e) { return { success: false, history: [], error: e.message }; }
}

async function saveHistory(data) {
  try {
    const r    = await chrome.storage.local.get([HISTORY_KEY]);
    let hist   = r[HISTORY_KEY] || [];
    const idx  = hist.findIndex(i => i.videoId === data.videoId);
    const entry = { ...data, timestamp: Date.now() };
    if (idx !== -1) hist[idx] = entry;
    else            hist.unshift(entry);
    if (hist.length > MAX_HISTORY) hist = hist.slice(0, MAX_HISTORY);
    await chrome.storage.local.set({ [HISTORY_KEY]: hist });
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
}
