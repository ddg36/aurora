import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const kit = read('ui/components/index.js');
const shell = read('ui/components/ToolShell.js');
const css = read('ui/components/tool-shell.css');

for (const primitive of ['ToolPage', 'ToolHeader', 'ToolSection', 'MetricStrip', 'Metric']) {
  assert.ok(kit.includes(primitive), `El kit debe exportar ${primitive}`);
  assert.ok(shell.includes(`function ${primitive}`), `Falta implementación de ${primitive}`);
}

for (const selector of ['.tool-page', '.tool-metric-strip', '.tool-module-grid', '.au-split-pane']) {
  assert.ok(css.includes(selector), `Falta composición compartida ${selector}`);
}
assert.match(css, /grid-template-columns:repeat\(auto-fit,minmax\(116px,1fr\)\)/);
assert.match(css, /@media\(max-width:480px\)/);

for (const view of ['stats', 'detective-tokens', 'toolkit', 'chain']) {
  const filename = view === 'detective-tokens' ? 'detective' : view;
  const source = read(`ui/modules/${view}/view/${filename}.js`);
  assert.match(source, /ToolPage/);
  assert.doesNotMatch(source, /max-w-3xl mx-auto p-4|grid grid-cols-2 md:grid-cols-4/);
}

const productivity = read('ui/modules/productividad/view/productividad.js');
assert.match(productivity, /MetricStrip/);
assert.doesNotMatch(productivity, /sm:grid-cols-2 lg:grid-cols-5/);

const prompts = read('ui/modules/prompts/view/prompts.js');
assert.match(prompts, /prompt-library-grid/);
assert.doesNotMatch(prompts, /minmax\(240px,1fr\)/);

console.log('OK — Tool surfaces: composición compartida, side-panel explícito y sin grillas legacy');
