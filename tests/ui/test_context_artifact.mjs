import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'ui/components/shared/context-artifact.js'), 'utf8');
const {
  createContextSnapshot,
  formatContextSnapshotMarkdown,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const artifact = createContextSnapshot({
  id: 'context:test',
  kind: 'page',
  title: '  Aurora\n Ideas  ',
  url: 'https://example.test/ideas',
  content: 'Primera idea.\n\nSegunda idea.',
  capturedAt: '2026-07-19T12:00:00-05:00',
});

assert.equal(artifact.artifactType, 'ContextSnapshot');
assert.equal(artifact.schemaVersion, 1);
assert.equal(artifact.title, 'Aurora Ideas');
assert.equal(artifact.capturedAt, '2026-07-19T17:00:00.000Z');
assert.equal(Object.isFrozen(artifact), true);

const markdown = formatContextSnapshotMarkdown(artifact);
assert.match(markdown, /^## Aurora Ideas/);
assert.match(markdown, /Fuente: https:\/\/example\.test\/ideas/);
assert.match(markdown, /Primera idea\.\n\nSegunda idea\.$/);

const longArtifact = createContextSnapshot({
  id: 'context:long',
  content: 'x'.repeat(20000),
  capturedAt: '2026-07-19T17:00:00.000Z',
});
const truncated = formatContextSnapshotMarkdown(longArtifact, { maxChars: 512 });
assert.equal(truncated.length, 512);
assert.match(truncated, /Contexto truncado por límite de destino/);

assert.throws(() => createContextSnapshot({ content: '   ' }), /no contiene texto/);
assert.throws(() => createContextSnapshot({ content: 'ok', capturedAt: 'nunca' }), /capturedAt inválido/);
assert.throws(() => formatContextSnapshotMarkdown({}), /ContextSnapshot/);

console.log('OK — ContextSnapshot conserva procedencia y respeta límites de destino');
