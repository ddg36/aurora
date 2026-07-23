import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const capture = read('ui/modules/captura/view/captura.js');
for (const marker of ['capture-context-bar', 'capture-action-bar', 'capture-idle-stage']) assert.ok(capture.includes(marker));
assert.doesNotMatch(capture, />🔍 Debug/);

const prompts = read('ui/modules/prompts/view/prompts.js');
const promptsCss = read('ui/modules/prompts/prompts.css');
assert.match(prompts, /prompt-library-summary/);
assert.match(promptsCss, /-webkit-line-clamp:2/);

const reader = read('ui/modules/md-reader/view/md-reader.js');
assert.match(reader, /rendered\.headings\.length === 0/);
assert.match(reader, /mdr-document-empty/);

const lyra = read('ui/modules/lyra/view/lyra.js').replaceAll('\0', '');
assert.match(lyra, /lyra-session-bar/);
assert.match(lyra, /lyra-starter-grid/);
assert.match(lyra, /Investigar.*Convertir.*Cuestionar/s);

console.log('OK — Radiation pass: intención visible, diagnóstico subordinado y vacíos accionables');
