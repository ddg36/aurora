import { getJSON, postJSON } from '../../../../components/shared/api.js';
import { hablar } from '../voz/voz.js';
import { copiarTexto } from '../../../../components/shared/clipboard.js';

const Toast = () => globalThis.Toast || { setStatus() {}, show() {} };

const NOTAS_ROOT = 'nexus/workspaces/aihub/scratchpad';
const NOTAS_CHAT = `${NOTAS_ROOT}/chat-notas.md`;

export async function copiarMensaje(texto) {
  if (!texto) return;
  // Markdown original, sin transformar: código, negrita, listas y saltos de
  // línea intactos — lo que el usuario ve renderizado es el mismo texto que
  // se pega en otro lado. Antes se aplastaba a una sola línea de texto plano
  // (\s+ -> ' '), lo que rompía bloques de código y fusionaba listas numeradas.
  const ok = await copiarTexto(texto);
  Toast().setStatus(ok ? '◉ Copiado al portapapeles' : '⚠ Error al copiar');
}

export async function añadirANotas(texto) {
  if (!texto) return;
  try {
    await postJSON('/nexus/fs/mkdir', { path: NOTAS_ROOT });
    let actual = '';
    try {
      const out = await getJSON(`/nexus/fs/read?path=${encodeURIComponent(NOTAS_CHAT)}`);
      actual = out.content || '';
    } catch {}
    const nuevo = actual ? actual + '\n\n---\n\n' + texto : texto;
    await postJSON('/nexus/fs/write', { path: NOTAS_CHAT, content: nuevo });
    Toast().setStatus('◉ Añadido a notas');
  } catch (e) {
    Toast().setStatus(`⚠ Error: ${e.message}`);
  }
}

export function reformularRespuesta(regenerarRespuesta, msg) {
  Toast().setStatus('◌ Regenerando…');
  setTimeout(() => regenerarRespuesta(msg), 100);
}

export function leerMensaje(texto) {
  if (!texto) return;
  hablar(texto);
  Toast().setStatus('◔ Leyendo…');
}
