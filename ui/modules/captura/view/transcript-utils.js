// Transcript utility functions — pure, no dependencies
const html = (...args) => globalThis.html(...args);

export function extractTimestamps(text) {
  const re = /\[(\d+):(\d{2})\]\s*([^\n]+)/g;
  const chapters = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const totalSec = parseInt(m[1]) * 60 + parseInt(m[2]);
    chapters.push({
      seconds: totalSec,
      timestamp: `[${m[1]}:${m[2]}]`,
      title: m[3].trim().slice(0, 120),
    });
  }
  return chapters;
}

export function getVideoId(url) {
  if (!url) return null;
  try {
    const params = new URLSearchParams(new URL(url).search);
    return params.get('v');
  } catch { return null; }
}

export function jumpToTimestamp(text, timestampStr, tabUrl) {
  const m = timestampStr.match(/(\d+):(\d{2})/);
  if (!m) return;
  const sec = parseInt(m[1]) * 60 + parseInt(m[2]);
  const videoId = getVideoId(tabUrl);
  if (videoId) {
    window.open(`https://www.youtube.com/watch?v=${videoId}&t=${sec}`, '_blank');
  }
}

export function searchMatches(text, query) {
  if (!query || !text) return [];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const found = [];
  let idx = 0;
  while ((idx = lower.indexOf(q, idx)) !== -1 && found.length < 100) {
    found.push({ start: idx, end: idx + query.length });
    idx += query.length;
  }
  return found;
}

export function contextAround(text, pos, contextLen = 60) {
  const start = Math.max(0, pos - contextLen);
  const end = Math.min(text.length, pos + 60);
  let ctx = text.slice(start, end);
  if (start > 0) ctx = '…' + ctx;
  if (end < text.length) ctx = ctx + '…';
  return ctx;
}

export function classifyUrl(url) {
  if (!url) return { tipo: 'desconocido' };
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname.startsWith('/watch') || u.hostname === 'youtu.be')
        return { tipo: 'youtube-video' };
      return { tipo: 'youtube' };
    }
    return { tipo: 'web' };
  } catch { return { tipo: 'desconocido' }; }
}
