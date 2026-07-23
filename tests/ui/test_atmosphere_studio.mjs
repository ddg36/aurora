import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const asModule = source => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

globalThis.html = () => null;
const icons = await asModule(read('ui/components/Icon.js'));
const catalog = await asModule(read('ui/components/themes/index.js'));

assert.equal(catalog.BACKGROUND_SERIES.length, 3);
assert.equal(catalog.BACKGROUNDS.length, 77);
assert.equal(new Set(catalog.BACKGROUNDS.map(item => item.id)).size, 77);
for (const item of catalog.BACKGROUNDS) {
  assert.ok(item.scene, `Fondo sin identidad de escena: ${item.id}`);
  assert.match(icons.iconSvg(item.icon), /^<svg/, `Icono de fondo desconocido: ${item.icon}`);
  assert.doesNotMatch(item.icon, /[\u{1F300}-\u{1FAFF}]/u);
}

assert.equal(catalog.HUDS.length, 12);
assert.equal(new Set(catalog.HUDS.map(item => item.id)).size, 12);
for (const item of catalog.HUDS) {
  assert.ok(item.behavior && item.description, `HUD sin propósito descrito: ${item.id}`);
  assert.match(icons.iconSvg(item.icon), /^<svg/, `Icono HUD desconocido: ${item.icon}`);
}

const lyriaTheme = catalog.THEMES.find(item => item.id === 'lyria');
const lyriaBackground = catalog.BACKGROUNDS.find(item => item.id === 'lyria-remake');
const lyriaHud = catalog.HUDS.find(item => item.id === 'lyria');
assert.equal(lyriaTheme?.name, 'Lyria Carmesí');
assert.equal(lyriaBackground?.name, 'Eclipse de Lyria');
assert.equal(lyriaBackground?.scene, 'lyria');
assert.equal(lyriaHud?.name, 'Mirada de Lyria');
assert.equal(lyriaHud?.behavior, 'Presencia');

const hudCss = read('ui/components/themes/hud/interface.css');
for (const semanticSurface of ['.au-panel', '.au-chat-message', '.au-toolbar', '.au-button', '.au-chip', '.aurora-footer']) {
  assert.ok(hudCss.includes(semanticSurface), `HUD V5 no integra ${semanticSurface}`);
}
for (const item of catalog.HUDS) {
  assert.ok(hudCss.includes(`data-preview-hud="${item.id}"`), `HUD sin preview fiel: ${item.id}`);
}
assert.doesNotMatch(hudCss, /content\s*:\s*['"](?:N|W|[\u16A0-\u16FF]|\u2726)/u, 'HUD no debe insertar glifos decorativos');
assert.match(hudCss, /data-preview-hud="lyria"[^}]*\.atmosphere-hud-panel::after/s);

const lyriaView = read('ui/modules/lyra/view/lyra.js');
const lyriaSurface = read('ui/components/lyra/lyra.surface.css');
assert.match(lyriaView, /data-lyria-state/);
for (const state of ['offline', 'ready', 'listening', 'thinking', 'working']) {
  assert.ok(lyriaView.includes(`'${state}'`) || lyriaSurface.includes(`data-lyria-state="${state}"`), `Falta estado de presencia Lyria: ${state}`);
}
assert.match(lyriaView, /class="lyria-gaze"/);
assert.match(lyriaView, /class="lyria-presence"/);
assert.doesNotMatch(lyriaSurface, /box-shadow:[^;}]*#fff(?:\W|$)/, 'Los ojos de Lyria no deben blanquearse como LED');

const settings = read('ui/modules/ajustes/view/ajustes.js');
assert.match(settings, /function BackgroundPreview/);
assert.match(settings, /function HudPreview/);
assert.match(settings, /function AtmosphereGrid/);
assert.match(settings, /function ThemePicker/);
assert.match(settings, /atmosphere-filter-row/);
assert.match(settings, /extension-registry-list/);
assert.match(settings, /<\$\{List\} layout="grid"/);
assert.doesNotMatch(settings, /function ChipGrid/, 'Apariencia no debe conservar el selector legacy');
assert.match(settings, /<\$\{Icon\} name="(?:download|upload|trash|plus)"/);

const scenes = read('ui/components/themes/scenes.css');
assert.match(scenes, /\.aurora-scene-scrim::before/);
assert.match(scenes, /\.aurora-lyria-presence/);
assert.match(scenes, /data-lyria-state="working"/);
const remake = read('ui/components/themes/backgrounds/Remake.js');
assert.match(remake, /function crimsonMoonTexture/);
assert.match(remake, /function crimsonGodRays/);
assert.match(remake, /offline:\.28,ready:\.72/);
assert.match(remake, /document\.addEventListener\('pointermove'/);
assert.match(remake, /const uiEngaged=/);
assert.match(remake, /globalCompositeOperation='multiply'/);
assert.match(remake, /data\.lyriaMoonKey/);
assert.ok(fs.existsSync(path.join(root, 'ui/assets/lyria-canon-v3-alpha.png')), 'Falta la presencia canónica recortada de Lyria');
assert.doesNotMatch(scenes, /lyria-sprite-eyes/, 'La identidad canónica no debe recibir ojos LED artificiales');
const ui = read('ui/components/ui.css');
assert.match(ui, /\.atmosphere-background-preview/);
assert.match(ui, /\.atmosphere-option-grid/);
for (const scene of ['void', 'clouds', 'aurora', 'matrix', 'rain', 'glitch', 'lyria', 'castle', 'abyss', 'lava', 'sakura', 'luna', 'tundra']) {
  assert.ok(ui.includes(`[data-scene="${scene}"]`), `Preview sin composición propia: ${scene}`);
}
assert.doesNotMatch(read('ui/app.js'), /v4-interface-hud-1/);

console.log('OK — Atmosphere Studio: 77 fondos, 12 HUD semánticos y previews verificables');
