import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const prompts = read('ui/modules/prompts/view/prompts.js');
const promptsCss = read('ui/modules/prompts/prompts.css');
assert.match(prompts, /prompt-library-toolbar/);
assert.match(prompts, /prompts-header/);
assert.match(prompts, /prompt-library-card-head/);
assert.match(prompts, /Buscar por intención, contenido o nombre/);
assert.match(promptsCss, /grid-template-columns:minmax\(180px,1fr\) 128px auto/);
assert.match(promptsCss, /max-width: 980px/);
assert.match(promptsCss, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);

const wiki = read('ui/modules/wiki/view/wiki.js');
const wikiCss = read('ui/modules/wiki/wiki.css');
for (const marker of ['wiki-workspace', 'wiki-document-bar', 'wiki-editor-grid', 'wiki-source-editor']) assert.ok(wiki.includes(marker));
assert.match(wikiCss, /@media\(max-width:720px\)/);
assert.doesNotMatch(wiki, /flex-1 flex flex-col md:flex-row min-h-0/);

const notes = read('ui/components/scratchpad/index.js');
for (const label of ['Insertar', 'Guardar', 'Pegar', 'Copiar', 'Limpiar']) assert.ok(notes.includes(label));
assert.doesNotMatch(notes, />Insert<|>Save<|>Paste<|>Clear</);
assert.match(notes, /icon="menu"/);

console.log('OK — Knowledge surfaces: intención filtrable, Wiki explícita y Notas coherentes');
