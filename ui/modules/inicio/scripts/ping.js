import { nexusOnline } from '../../../store.js';

const BASE = globalThis.__AURORA_BASE__ || 'http://localhost:7779';
let _interval = null;

async function _ping() {
  try {
    const ok = (await fetch(`${BASE}/ping`, { signal: AbortSignal.timeout(2000) })).ok;
    nexusOnline.value = ok;
  } catch {
    nexusOnline.value = false;
  }
}

export function startPing() {
  _ping();
  _interval = setInterval(_ping, 30_000);
}

export function stopPing() {
  clearInterval(_interval);
  _interval = null;
}
