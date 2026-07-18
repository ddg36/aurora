import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const bridge = read('src/pi/bridge.py');
const router = read('src/pi/router.py');
const websocket = read('ui/components/shared/lyra-ws.js');
const lyra = read('ui/modules/lyra/view/lyra.js');

// La memoria local nunca se reconstruye desde SQLite ni se pasan schemas de
// tools desde el browser. Pi SessionManager es la única autoridad agentic.
const sendSignature = websocket.match(/export async function sendToLyra\(\{([\s\S]*?)\}\) \{/u)?.[1] || '';
const payloadLine = websocket.match(/const payload = \{ type: 'chat'[^\n]+/u)?.[0] || '';
assert.doesNotMatch(sendSignature, /\bhistory\b|\btools\b/u);
assert.doesNotMatch(payloadLine, /\bhistory\b|\btools\b/u);
assert.doesNotMatch(lyra, /sendToLyra\(\{[\s\S]{0,500}\b(?:history|tools):/u);

// Regenerar debe ramificar la sesión oficial desde el padre del turno, no
// repetir el prompt encima de una memoria intacta.
assert.match(bridge, /'type': 'fork', 'entryId': str\(user_entry_id\)/u);
assert.match(bridge, /mapa\[str\(chat_id\)\] = ruta/u);
assert.match(lyra, /retry: \{ userEntryId: msg\._piTurn\.userEntryId \}/u);
assert.match(lyra, /parentEntryId: piTurnContext\?\.parentEntryId \?\? null/u);
assert.match(lyra, /userEntryId: piSessionSnapshot\?\.lastUserEntryId \?\? null/u);

// El cierre se produce fuera del callback de stdout: primero snapshot de la
// sesión autoritativa y sólo entonces `done`, evitando el auto-deadlock RPC.
const agentEnd = bridge.match(/elif tipo == 'agent_end':([\s\S]*?)elif tipo == 'queue_update':/u)?.[1] || '';
assert.match(agentEnd, /self\.fin\.set\(\)/u);
assert.doesNotMatch(agentEnd, /proceso\.pedir|_enviar_session_snapshot|type': 'done'/u);
assert.match(bridge, /await self\.fin\.wait\(\)\s+await self\._enviar_session_snapshot\(proceso\)/u);

// Contrato de diagnóstico: todos los lectores de memoria y switch reales de
// Pi deben ejercitarse sin devolver el contenido de los mensajes.
for (const command of [
  'get_state', 'get_messages', 'get_entries', 'get_tree',
  'get_session_stats', 'switch_session',
]) {
  assert.match(bridge, new RegExp(`'type': '${command}'`));
}
assert.match(router, /tipo == 'session_audit'[\s\S]{0,120}auditar_sesion/u);
assert.match(websocket, /export function auditPiSession\(chatId\)/u);
assert.match(websocket, /export async function refreshPiStatus\(chatId = null\)/u);
assert.match(lyra, /refreshPiStatus\(chatIdVal\)/u);

// Runtime y degradación también son parte del contrato; incluso sin sessionId
// el frontend debe conservar el estado "Pi no disponible".
assert.match(bridge, /'runtime': 'pi-rpc', 'protocol_version': 1/u);
assert.match(bridge, /'degraded': True/u);
assert.match(bridge, /'degraded': False/u);
assert.match(websocket, /if \(msg\.type === 'session_init' \|\| msg\.type === 'status'\)/u);

console.log('OK — Pi SessionManager es autoridad: continuidad, fork, auditoría y degradación');
