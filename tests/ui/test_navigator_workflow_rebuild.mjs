import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const view = read('ui/modules/webnavigator/view/web-navigator.js');
const css = read('ui/modules/webnavigator/webnavigator.css');

for (const primitive of ['ToolPage', 'ToolHeader', 'ToolSection', 'Status']) assert.ok(view.includes(primitive));
for (const marker of ['navigator-command', 'navigator-runs', 'navigator-stage-body', 'navigator-evidence']) assert.ok(view.includes(marker));
assert.doesNotMatch(view, /SplitPane|Todo el log|flex gap-2 text-xs py-1 border-b/);
assert.match(view, /Describe el resultado terminado, no una lista de clics/);
assert.match(view, /Eventos.*Evidencia/s);
assert.match(css, /@media\(max-width:800px\)/);
assert.match(css, /grid-template-columns:34px 62px minmax\(0,1fr\)/);

console.log('OK — Navigator: objetivo, ejecuciones, eventos y evidencia forman un workflow');
