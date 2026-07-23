import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const asModule = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

globalThis.html = () => null;
const icons = await asModule(read('ui/components/Icon.js'));
const actions = await asModule(read('ui/modules/inicio/foot/actions.js'));
const view = read('ui/modules/inicio/view/inicio.js');
const css = read('ui/modules/inicio/inicio.css');

assert.equal(actions.QUICK_ACTIONS.length, 6);
for (const action of actions.QUICK_ACTIONS) {
  assert.match(icons.iconSvg(action.icon), /^<svg/, `Acceso sin SVG compartido: ${action.tab}`);
}

for (const component of ['Button', 'Panel', 'PanelBody', 'Status', 'Icon']) {
  assert.ok(view.includes(component), `Inicio debe reutilizar ${component}`);
}
for (const selector of ['.home-health-grid', '.home-metrics', '.home-tool-grid', 'button.home-tool']) {
  assert.ok(css.includes(selector), `Falta estructura Command Deck: ${selector}`);
}
assert.doesNotMatch(view, /quick-card|stat-card|db-status-chip/);
assert.doesNotMatch(css, /\.quick-card|\.stat-card|\.db-status-chip/);
assert.match(css, /@media \(max-width:520px\)/);

console.log('OK — Inicio Command Deck: jerarquía compacta, SVG compartido y sin tarjetas legacy');
