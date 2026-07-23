import { signal } from '../../../../store.js';

const MAX = 24;

export const toolActivity = signal([]);

function _argsPreview(args) {
  if (!args || typeof args !== 'object') return '';
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`)
    .join(' · ')
    .slice(0, 80);
}

function _detail(value, max = 3000) {
  if (value == null) return '';
  try {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return text.length > max ? `${text.slice(0, max)}\n…` : text;
  } catch {
    return String(value).slice(0, max);
  }
}

export function trackStart(name, args = {}, meta = {}) {
  const id      = Date.now() + Math.random();
  const preview = _argsPreview(args);
  const scope   = meta.scope || 'local';
  const risk    = meta.risk || 'low';
  toolActivity.value = [{
    id,
    name,
    tool: name,
    scope,
    risk,
    preview,
    input: _detail(args),
    status: 'running',
    ts: Date.now(),
    ms: null,
    duration: null,
    result: null,
    error: null,
  }, ...toolActivity.value].slice(0, MAX);
  return id;
}

export function trackEnd(id, status, result = '', meta = {}) {
  toolActivity.value = toolActivity.value.map(e => {
    if (e.id !== id) return e;
    const duration = Date.now() - e.ts;
    const isError = status === 'error';
    return {
      ...e,
      status,
      ms: duration,
      duration,
      result: _detail(result, 4000),
      error: isError ? _detail(meta.error || result, 4000) : null,
    };
  });
}

export function clearActivity() {
  toolActivity.value = [];
}
