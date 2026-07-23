import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const tracker = read('ui/modules/lyra/scripts/chat/actividad.js');
const bar = read('ui/modules/lyra/view/tool-activity-bar.js');
const lyria = read('ui/modules/lyra/view/lyra.js');
const css = read('ui/components/fx.css');

assert.match(tracker, /input: _detail\(args\)/, 'El tracker debe conservar la entrada inspeccionable');
assert.match(tracker, /result: _detail\(result, 4000\)/, 'El resultado no debe quedar reducido a un tooltip inútil');
assert.match(bar, /aria-expanded=/, 'Cada ejecución debe poder inspeccionarse');
assert.match(bar, /tool-activity-inspector/, 'Falta el panel de detalle');
assert.match(bar, /Entrada/);
assert.match(bar, /Resultado/);
assert.match(bar, /Copiar detalle/);
assert.doesNotMatch(lyria, /<\$\{ToolActivityBar\}/, 'La telemetría no debe duplicar la cronología debajo del chat');
assert.match(lyria, /Array\.isArray\(msg\._piTurn\?\.blocks\)/, 'El historial debe renderizar la cronología Pi persistida');
assert.match(lyria, /lyria_trace_default_expanded/, 'La preferencia de apertura debe persistir');
assert.match(lyria, /traceSeedRef/, 'Cada bloque debe conservar el default con el que apareció');
assert.match(lyria, /aria-expanded=\$\{abierto\}/, 'Thinking y tools deben exponer su estado interactivo');
assert.match(lyria, /toggleThinking\(blockKey\)/, 'Thinking en vivo debe ser independiente');
assert.match(lyria, /toggleTool\(blockKey\)/, 'Cada tool en vivo debe ser independiente');
assert.match(css, /\.fx-tool-activity\.is-inspecting/);
assert.match(css, /\.fx-tool-chip:focus-visible/, 'La interacción necesita foco visible');

console.log('OK — actividad de tools compacta, seleccionable e inspeccionable');
