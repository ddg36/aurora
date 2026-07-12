import { getJSON, postJSON } from '../../../../components/shared/api.js';
import { hablar } from '../voz/voz.js';
import { copiarTexto } from '../../../../components/shared/clipboard.js';

const Toast = () => globalThis.Toast || { setStatus() {}, show() {} };

const NOTAS_ROOT = 'nexus/workspaces/aihub/scratchpad';
const NOTAS_CHAT = `${NOTAS_ROOT}/chat-notas.md`;

export async function copiarMensaje(texto) {
  if (!texto) return;

  const textoPlano = texto
    .replace(/```[\s\S]*?```/g, '[código]')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  const ok = await copiarTexto(textoPlano);
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
