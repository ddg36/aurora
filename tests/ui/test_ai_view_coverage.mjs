import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tabs = [...read('ui/components/nav/nav-tabs.js').matchAll(/\{ id: '([^']+)'/g)].map(match => match[1]);
const routes = read('ui/components/shared/view-action-dispatch.js');
const modules = fs.readdirSync(path.join(root, 'ui/modules'), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .flatMap(entry => {
    const view = path.join(root, 'ui/modules', entry.name, 'view');
    return fs.existsSync(view) ? fs.readdirSync(view).filter(file => file.endsWith('.js')).map(file => read(`ui/modules/${entry.name}/view/${file}`)) : [];
  }).join('\n');

for (const tab of tabs) {
  const viewId = tab === 'lyra' ? 'lyria' : tab;
  const escaped = viewId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(routes, new RegExp(`(?:['"]${escaped}['"]|\\b${escaped})\\s*:`), `${tab} debe tener ruta semántica`);
  assert.match(modules, new RegExp(`id:\\s*['"]${viewId}['"]`), `${tab} debe publicar registerAIView`);
}

console.log(`OK — ${tabs.length} tabs del riel tienen ruta y contrato AIView`);
