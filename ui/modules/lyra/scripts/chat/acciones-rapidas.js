import { getJSON, postJSON } from '../../../../components/shared/api.js';
import { hablar } from '../voz/voz.js';
import { copiarTexto } from '../../../../components/shared/clipboard.js';

const Toast = () => globalThis.Toast || { setStatus() {}, show() {} };

const NOTAS_ROOT = 'nexus/workspaces/aihub/scratchpad';
const NOTAS_CHAT = `${NOTAS_ROOT}/chat-notas.md`;

// ChatGPT genera cada punto de una lista como un <ol> propio (uno por ítem,
// separado por su párrafo de explicación) y usa el atributo HTML `start` para
// que el navegador los numere en secuencia — invisible al extraer texto
// plano. El markdown que realmente persiste Aurora trae "1." repetido en cada
// punto. El render visual de Lyra ya lo corrige (numeración nativa del <ol>
// fusionado), pero el texto copiado es crudo: sin esto, pegar en otro lado
// (sin ese renderer) muestra "1. 1. 1." en vez de "1. 2. 3.".
const RE_ITEM_NUMERADO = /^(\s*)(\d+)\.(\s+)/;
function renumerarListasMarkdown(texto) {
  const lineas = texto.split('\n');
  let contador = 0;
  let dentroDeLista = false;
  for (let i = 0; i < lineas.length; i++) {
    const m = lineas[i].match(RE_ITEM_NUMERADO);
    if (m) {
      contador = dentroDeLista ? contador + 1 : 1;
      dentroDeLista = true;
      lineas[i] = lineas[i].replace(RE_ITEM_NUMERADO, `${m[1]}${contador}.${m[3]}`);
      continue;
    }
    // Una línea vacía o de párrafo no rompe la lista (mismo criterio que el
    // renderer); un heading, tabla o bullet sí la corta.
    if (dentroDeLista && (/^\s*#{1,6}\s/.test(lineas[i]) || /^\s*[-*•]\s/.test(lineas[i]))) {
      dentroDeLista = false;
    }
  }
  return lineas.join('\n');
}

export async function copiarMensaje(texto) {
  if (!texto) return;
  // Markdown original, sin aplastar (código, negrita y saltos de línea
  // intactos) pero con las listas numeradas renumeradas: lo pegado en otro
  // lado se ve como el usuario lo ve renderizado, no como ChatGPT lo mandó.
  const ok = await copiarTexto(renumerarListasMarkdown(texto));
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
