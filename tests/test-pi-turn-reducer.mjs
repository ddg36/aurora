import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reducerSource = fs.readFileSync(path.join(root, 'ui/modules/lyra/scripts/chat/pi-turn-reducer.js'), 'utf8');
const reducer = await import(`data:text/javascript;base64,${Buffer.from(reducerSource).toString('base64')}`);
const { createPiTurnState, reducePiTurn, piTurnText } = reducer;
const env = (seq, event) => ({ type: 'pi_event', protocolVersion: 1, runtime: 'pi-rpc', seq, event });

let state = createPiTurnState();
state = reducePiTurn(state, env(1, {
  type: 'message_start', message: { role: 'assistant', timestamp: 100, content: [] },
}));
state = reducePiTurn(state, env(2, {
  type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Reviso ' },
}));
state = reducePiTurn(state, env(3, {
  type: 'message_update', assistantMessageEvent: {
    type: 'toolcall_end', contentIndex: 1,
    toolCall: { type: 'toolCall', id: 'call-read-a', name: 'read', arguments: { path: '/a' } },
  },
}));
state = reducePiTurn(state, env(4, {
  type: 'tool_execution_start', toolCallId: 'call-read-a', toolName: 'read', args: { path: '/a' },
}));
state = reducePiTurn(state, env(5, {
  type: 'tool_execution_update', toolCallId: 'call-read-a', toolName: 'read', args: { path: '/a' },
  partialResult: { content: [{ type: 'text', text: 'parcial A' }], details: { bytes: 4 } },
}));

// Dos tools del mismo nombre deben vivir separadas por el ID oficial de Pi.
state = reducePiTurn(state, env(6, {
  type: 'tool_execution_start', toolCallId: 'call-read-b', toolName: 'read', args: { path: '/b' },
}));
state = reducePiTurn(state, env(7, {
  type: 'tool_execution_end', toolCallId: 'call-read-b', toolName: 'read', isError: true,
  result: { content: [{ type: 'text', text: 'no existe B' }], details: { code: 'ENOENT' } },
}));
state = reducePiTurn(state, env(8, {
  type: 'tool_execution_end', toolCallId: 'call-read-a', toolName: 'read', isError: false,
  result: {
    content: [
      { type: 'text', text: 'archivo A' },
      { type: 'image', data: 'abc', mimeType: 'image/png' },
    ],
    details: { bytes: 9 },
  },
}));

const readA = state.blocks.find(block => block.id === 'call-read-a');
const readB = state.blocks.find(block => block.id === 'call-read-b');
assert.equal(readA.status, 'success');
assert.equal(readA.output, 'archivo A');
assert.equal(readA.resultContent[1].type, 'image');
assert.deepEqual(readA.details, { bytes: 9 });
assert.equal(readB.status, 'error');
assert.equal(readB.output, 'no existe B');
assert.deepEqual(readB.details, { code: 'ENOENT' });

// Snapshot final autoritativo: conserva el resultado ya correlacionado.
state = reducePiTurn(state, env(9, {
  type: 'message_end',
  message: {
    role: 'assistant', timestamp: 100, stopReason: 'toolUse', usage: { output: 12 },
    content: [
      { type: 'text', text: 'Reviso ' },
      { type: 'toolCall', id: 'call-read-a', name: 'read', arguments: { path: '/a' } },
      { type: 'toolCall', id: 'call-read-b', name: 'read', arguments: { path: '/b' } },
    ],
  },
}));
assert.equal(state.blocks.find(block => block.id === 'call-read-a').status, 'success');

// Continuación posterior a las tools pertenece al mismo turno visual y no
// reemplaza sus bloques anteriores.
state = reducePiTurn(state, env(10, {
  type: 'message_start', message: { role: 'assistant', timestamp: 200, content: [] },
}));
state = reducePiTurn(state, env(11, {
  type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Listo.' },
}));
assert.equal(piTurnText(state), 'Reviso Listo.');
assert.equal(state.blocks.filter(block => block.tipo === 'tool').length, 2);

// Replay/out-of-order no modifica estado.
const same = reducePiTurn(state, env(8, { type: 'agent_end' }));
assert.equal(same, state);

const bridge = fs.readFileSync(path.join(root, 'src/pi/bridge.py'), 'utf8');
assert.match(bridge, /'type': 'pi_event'/);
assert.match(bridge, /'protocolVersion': 1/);
assert.match(bridge, /delta\.pop\('partial', None\)/);
assert.match(bridge, /await self\._enviar_evento_pi\(evt\)/);

const websocket = fs.readFileSync(path.join(root, 'ui/components/shared/lyra-ws.js'), 'utf8');
assert.match(websocket, /case 'pi_event':[\s\S]{0,160}onPiEvent/);
assert.match(websocket, /case 'tool_call':\s+if \(!_handlers\._piNativeSeen\)/);

const messages = fs.readFileSync(path.join(root, 'ui/modules/lyra/scripts/chat/mensajes.js'), 'utf8');
const messageList = fs.readFileSync(path.join(root, 'ui/modules/lyra/view/message-list.js'), 'utf8');
const lyraView = fs.readFileSync(path.join(root, 'ui/modules/lyra/view/lyra.js'), 'utf8');
const chatRoutes = fs.readFileSync(path.join(root, 'src/db/routes/chats.py'), 'utf8');
assert.match(messages, /guardarMensaje\(chatId, rol, texto, estructura = null\)/);
assert.match(messageList, /Array\.isArray\(msg\._piTurn\?\.blocks\)/);
assert.match(chatRoutes, /estructura_json/);
assert.match(lyraView, /const esPiNativo = piTurn\.lastSeq > 0/);
assert.match(lyraView, /esPiNativo\s*\? \(piTurnText\(piTurn, 'text'\)/);

console.log('OK — Pi-native turns: IDs oficiales, paralelismo, snapshots y resultados estructurados');
