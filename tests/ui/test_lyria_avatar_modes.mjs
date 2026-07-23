import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const manifest = read('ui/components/lyra/avatar-manifest.js');
const avatarState = read('ui/components/lyra/avatar-state.js');
const presence = read('ui/components/lyra/avatar-presence.js');
const styles = read('ui/components/lyra/avatar-presence.css');
const duo = read('ui/modules/lyra/scripts/chat/duo.js');
const lyria = read('ui/modules/lyra/view/lyra.js');
const app = read('ui/app.js');

assert.match(manifest, /lyria-canon-v3-alpha\.png/);
for (const state of ['offline', 'ready', 'listening', 'thinking', 'working', 'speaking', 'tool-use', 'compacting']) {
  assert.match(manifest, new RegExp(`["']?${state}["']?\\s*:`), `Falta estado de avatar: ${state}`);
}
for (const mood of ['neutral', 'happy', 'annoyed', 'sad', 'curious', 'surprised', 'focused']) {
  assert.match(avatarState, new RegExp(`['"]${mood}['"]`), `Falta ánimo de Lyria: ${mood}`);
  assert.match(manifest, new RegExp(`${mood}\\s*:`), `El manifest no admite el ánimo: ${mood}`);
}
assert.match(manifest, /variants\?\.\[`\$\{state\}:\$\{mood\}`\]/, 'Una pose combinada debe ganar sobre estado y ánimo generales');
assert.match(avatarState, /lyria:avatar-mood/, 'Falta el puente explícito para cambiar el ánimo');

assert.match(presence, /function AvatarVoiceOverlay/);
assert.match(presence, /function LyriaLocalDock/);
assert.match(presence, /function AvatarScene/);
assert.match(presence, /function AvatarStage/);
assert.match(presence, /normalized\.length > 1/);
assert.match(presence, /data-active-speaker=/);
assert.match(presence, /lyria-avatar-abstract-mark/);
assert.match(presence, /data-avatar-mood=/);
assert.match(presence, /image\.decode\(\)/, 'El cambio de pose debe precargar la imagen antes de revelarla');
assert.match(presence, /tab !== 'lyra'/, 'El overlay flotante debe ceder su lugar al dock dentro de Lyria');
assert.match(app, /h\(AvatarVoiceOverlay/);

assert.match(lyria, /lyria_avatar_mode/);
assert.match(lyria, /lyria_local_dock_visible/);
assert.match(lyria, /const avatarLiveText/);
assert.match(lyria, /const avatarLastMessage/);
assert.match(lyria, /responseHtml=\$\{avatarResponseHtml\}/);
assert.doesNotMatch(presence, /AvatarScene\(\{[^}]*messages/s, 'El escenario no debe recibir ni acumular el historial');
assert.doesNotMatch(lyria, /if \(enabled && cloudVisible\)/, 'Avatar no debe bloquearse por tener Cloud abierto');
assert.doesNotMatch(lyria, /disabled=\$\{cloudVisible\}/, 'El botón Avatar debe seguir disponible con Cloud abierto');
assert.match(lyria, /data-presentation-mode=/, 'Falta el eje presentationMode chat|avatar');
assert.match(lyria, /data-conversation-mode=/, 'Falta el eje conversationMode single|duo');
assert.match(lyria, /const avatarActors = duoActivo/, 'Avatar debe componer dos actores cuando Duo está activo');
assert.match(lyria, /activeSpeaker=\$\{avatarActiveSpeaker\}/, 'El escenario debe saber quién habla');
assert.match(duo, /onTurn/, 'Duo debe publicar eventos de turno para la presentación Avatar');
assert.match(duo, /speaker,\s*phase,\s*text/, 'El evento Duo debe identificar hablante, fase y texto');

assert.match(styles, /\.lyria-avatar-stage/);
assert.match(styles, /\.lyria-avatar-stage\.is-duo/);
assert.match(styles, /\.lyria-avatar-actor\.is-active/);
assert.match(styles, /\.lyria-local-dock/);
assert.match(styles, /\.lyria-voice-overlay/);
assert.match(styles, /prefers-reduced-motion/);

console.log('OK — Lyria Avatar Engine: chat/avatar independientes y Duo visual por hablante');
