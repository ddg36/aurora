import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const draftSource = read('ui/modules/lyra/scripts/chat/turn-draft.js');
const lyria = read('ui/modules/lyra/view/lyra.js');
const mensajes = read('ui/modules/lyra/scripts/chat/mensajes.js');

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
const draft = await import(`data:text/javascript;base64,${Buffer.from(draftSource).toString('base64')}`);

const original = {
  turnId: 'turn:test', chatId: 7, prompt: 'continúa', startedAt: 123,
  blocks: [
    { tipo: 'thinking', contenido: 'examino el archivo' },
    { tipo: 'tool', id: 't1', name: 'read', argsFull: '{"path":"x"}', output: 'ok' },
    { tipo: 'text', contenido: 'respuesta parcial' },
  ],
};
assert.equal(draft.saveTurnDraft(original), true);
assert.deepEqual(draft.loadTurnDraft(7).blocks, original.blocks);
assert.equal(draft.draftText(original.blocks), 'respuesta parcial');
assert.equal(draft.loadTurnDraft(8), null);
assert.equal(draft.clearTurnDraft('otro'), false);
assert.equal(draft.clearTurnDraft('turn:test'), true);

assert.match(mensajes, /estructura \}\);/, 'El candidato local debe conservar la estructura rica');
const saveUser = lyria.indexOf("guardarMensaje(chatActualId.value, 'user', texto)");
const send = lyria.indexOf('await sendToLyra({');
assert.ok(saveUser >= 0 && saveUser < send, 'El prompt debe persistirse antes de iniciar Pi');
assert.match(lyria, /latestDraftRef\.current = \{ \.\.\.activeTurn, blocks: asistenteEnVivo\.blocks \}/);
assert.match(lyria, /setTimeout\(\(\) => \{[\s\S]*saveTurnDraft\(latestDraftRef\.current\);[\s\S]*\}, 300\)/,
  'El checkpoint debe agrupar deltas; localStorage síncrono no puede ejecutarse por token');
assert.match(lyria, /window\.addEventListener\('pagehide', flushDraft\)/,
  'La cadencia agrupada debe conservar un flush síncrono al salir');
assert.match(lyria, /interrupted: true/);
assert.match(lyria, /Interrumpida por recarga/);
assert.match(lyria, /const persisted = await guardarMensaje\(chatIdVal, 'assistant', content, estructura\)/);
assert.match(lyria, /if \(persisted\) clearTurnDraft\(draft\.turnId\)/, 'No debe borrar el checkpoint si la DB sigue caída');

console.log('OK — hard reload conserva prompt y checkpoint cronológico parcial');
