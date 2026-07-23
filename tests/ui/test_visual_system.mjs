import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const asModule = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

globalThis.html = () => null;

const icons = await asModule(read('ui/components/Icon.js'));
const { TABS } = await asModule(read('ui/components/nav/nav-tabs.js'));

assert.equal(TABS.length, 18);
assert.equal(new Set(TABS.map(tab => tab.id)).size, TABS.length);
for (const tab of TABS) {
  const svg = icons.iconSvg(tab.icon);
  assert.match(svg, /^<svg/);
  assert.match(svg, /stroke="currentColor"/);
  assert.match(svg, /fill="none"/);
  assert.doesNotMatch(tab.icon, /<svg|[\u{1F300}-\u{1FAFF}]/u);
}

assert.deepEqual(icons.splitIconLabel('📄 Capturar página'), { icon: 'file-text', label: 'Capturar página' });
assert.deepEqual(icons.splitIconLabel('Texto intacto'), { icon: null, label: 'Texto intacto' });
assert.equal(icons.resolveIconName('🗑'), 'trash');
assert.equal(icons.resolveIconName('settings'), 'settings');

const lyra = read('ui/modules/lyra/view/lyra.js');
assert.doesNotMatch(lyra, /const\s+ICON_[A-Z_]+\s*=/, 'Lyria no debe mantener una librería SVG paralela');
assert.doesNotMatch(lyra, /dangerouslySetInnerHTML=.*ICON_/, 'Lyria debe consumir Icon');
assert.doesNotMatch(read('ui/components/footer/registry.js'), /const\s+SVG_|\bsvg\s*:/, 'Footer no debe declarar SVG inline');
assert.doesNotMatch(read('ui/modules/lyra/view/message-list.js'), /<svg\b/, 'Las vistas Lyria deben consumir Icon');

const toolkit = await asModule(read('ui/modules/toolkit/scripts/herramientas.js'));
for (const tool of toolkit.HERRAMIENTAS) {
  assert.match(icons.iconSvg(tool.icono), /^<svg/, `Icono Toolkit desconocido: ${tool.icono}`);
  assert.doesNotMatch(tool.icono, /[\u{1F300}-\u{1FAFF}]/u);
}

for (const view of [
  'ui/modules/webnavigator/view/web-navigator.js',
  'ui/modules/wiki/view/wiki.js',
]) {
  assert.match(read(view), /<\$\{Icon\}/, `${view} debe consumir Icon`);
}
for (const view of [
  'ui/modules/stats/view/stats.js',
  'ui/modules/detective-tokens/view/detective.js',
  'ui/modules/toolkit/view/toolkit.js',
]) {
  assert.match(read(view), /ToolHeader/, `${view} debe consumir la cabecera SVG compartida`);
}

const tokens = read('ui/components/tokens.css');
for (const token of ['--aurora-control-h', '--aurora-surface-2', '--aurora-focus-ring', '--aurora-duration']) {
  assert.match(tokens, new RegExp(token));
}

const ui = read('ui/components/ui.css');
for (const selector of ['.nav-rail-button', '.au-button', '.au-panel', '.au-field', '.au-chip', '.au-dropdown']) {
  assert.ok(ui.includes(selector), `Falta selector vNext: ${selector}`);
}

console.log('OK — Visual System vNext: 18 tabs SVG, tokens y primitivas coherentes');
