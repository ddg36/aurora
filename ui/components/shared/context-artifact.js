const CONTEXT_SCHEMA_VERSION = 1;

function cleanInline(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function makeId(capturedAt) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `context:${uuid}` : `context:${capturedAt}:${Math.random().toString(36).slice(2, 10)}`;
}

export function createContextSnapshot({
  id,
  kind = 'web-page',
  title = '',
  url = '',
  content,
  capturedAt = new Date().toISOString(),
  source = 'captura',
} = {}) {
  const text = String(content || '').trim();
  if (!text) throw new Error('El contexto no contiene texto');

  const timestamp = new Date(capturedAt);
  if (Number.isNaN(timestamp.getTime())) throw new Error('capturedAt inválido');

  return Object.freeze({
    artifactType: 'ContextSnapshot',
    schemaVersion: CONTEXT_SCHEMA_VERSION,
    id: cleanInline(id) || makeId(timestamp.toISOString()),
    kind: (cleanInline(kind) || 'web-page').slice(0, 64),
    title: cleanInline(title).slice(0, 240),
    url: String(url || '').trim().slice(0, 2048),
    content: text,
    capturedAt: timestamp.toISOString(),
    source: (cleanInline(source) || 'captura').slice(0, 64),
  });
}

export function formatContextSnapshotMarkdown(snapshot, { maxChars = 12000 } = {}) {
  if (snapshot?.artifactType !== 'ContextSnapshot') throw new Error('Se esperaba un ContextSnapshot');
  const limit = Math.max(256, Number(maxChars) || 12000);
  const title = snapshot.title || 'Contexto web';
  const heading = `## ${title}`;
  const origin = snapshot.url ? `Fuente: ${snapshot.url}` : 'Fuente: página activa';
  const metadata = `Capturado por Aurora · ${snapshot.kind} · ${snapshot.capturedAt}`;
  const prefix = `${heading}\n\n${origin}\n${metadata}\n\n`;
  const suffix = '\n\n— Contexto truncado por límite de destino —';

  if (prefix.length + snapshot.content.length <= limit) return prefix + snapshot.content;
  const available = Math.max(0, limit - prefix.length - suffix.length);
  return (prefix + snapshot.content.slice(0, available).trimEnd() + suffix).slice(0, limit);
}

