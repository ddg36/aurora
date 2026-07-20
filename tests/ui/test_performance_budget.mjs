import assert from 'node:assert/strict';
import fs from 'node:fs';

const lyria = fs.readFileSync('ui/modules/lyra/view/lyra.js', 'utf8');
const themes = fs.readFileSync('ui/components/themes/lib.js', 'utf8');
const remake = fs.readFileSync('ui/components/themes/backgrounds/Remake.js', 'utf8');

assert.match(lyria, /publishTimer = setTimeout\(publish, 40\)/, 'streaming debe agrupar renders');
assert.match(lyria, /draftCheckpointTimerRef\.current = setTimeout[\s\S]*\}, 300\)/, 'checkpoint debe agrupar escrituras síncronas');
assert.match(lyria, /window\.addEventListener\('pagehide', flushDraft\)/, 'checkpoint agrupado debe tener flush de salida');
assert.match(themes, /const minFrameMs = sceneQuality\(\) === 'low' \? 50 : 33/, 'escenas deben respetar presupuesto de frame');
assert.match(remake, /sceneFrame\(this\.loop\)/, 'Remake no debe escapar del scheduler compartido');
assert.doesNotMatch(remake, /requestAnimationFrame\(this\.loop\)/);

console.log('OK — streaming, checkpoint y canvases respetan presupuesto de hilo principal');
