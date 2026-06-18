import { getJSON, postJSON } from '../../../components/shared/api.js';

export function estimar(texto) {
  const chars = texto.length;
  const palabras = (texto.match(/\S+/g) || []).length;
  const cjk = (texto.match(/[一-鿿぀-ヿ]/g) || []).length;
  const codigo = (texto.match(/[{}()\[\];=<>]/g) || []).length;
  const tokens = Math.ceil(chars / 4 + cjk * 0.5 + codigo * 0.2);
  return { chars, palabras, tokens, breakdown: { base: Math.ceil(chars / 4), cjk, simbolos_codigo: codigo } };
}

function hashTexto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return 'tk_' + h.toString(16).padStart(8, '0');
}

export async function guardarAnalisis(texto, est) {
  await postJSON('/db/token-analisis', { texto_hash: hashTexto(texto), chars: est.chars, tokens_est: est.tokens });
}

export function cargarHistorial() {
  return getJSON('/db/token-analisis?limit=20');
}
