export const BASE = globalThis.__AURORA_BASE__ || 'http://localhost:7779';

export const hdrs = () => globalThis.__AURORA_HDRS__?.() || { 'Content-Type': 'application/json' };

export async function getJSON(path) {
  const res = await fetch(BASE + path, { headers: hdrs() });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

export async function sendJSON(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: hdrs(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

export const postJSON = (path, body) => sendJSON('POST', path, body);
export const putJSON = (path, body) => sendJSON('PUT', path, body);
export const patchJSON = (path, body) => sendJSON('PATCH', path, body);
export const deleteJSON = (path) => sendJSON('DELETE', path);
