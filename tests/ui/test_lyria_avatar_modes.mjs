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
assert.match(presence, /function AvatarStage/);
assert.match(presence, /data-avatar-mood=/);
assert.match(presence, /image\.decode\(\)/, 'El cambio de pose debe precargar la imagen antes de revelarla');
assert.match(presence, /tab !== 'lyra'/, 'El overlay flotante debe ceder su lugar al dock dentro de Lyria');
assert.match(app, /h\(AvatarVoiceOverlay/);

assert.match(lyria, /lyria_avatar_mode/);
assert.match(lyria, /lyria_local_dock_visible/);
assert.match(lyria, /const avatarLiveText/);
assert.match(lyria, /const avatarLastMessage/);
assert.match(lyria, /responseHtml=\$\{avatarResponseHtml\}/);
assert.doesNotMatch(presence, /AvatarStage\(\{[^}]*messages/s, 'El escenario no debe recibir ni acumular el historial');
assert.match(lyria, /setAvatarMode\(false\);\s*setCloudExpanded/, 'Abrir Cloud debe salir del modo Avatar local');

assert.match(styles, /\.lyria-avatar-stage/);
assert.match(styles, /\.lyria-local-dock/);
assert.match(styles, /\.lyria-voice-overlay/);
assert.match(styles, /prefers-reduced-motion/);

console.log('OK — Lyria Avatar Engine: overlay, dock local y escenario de respuesta única');
