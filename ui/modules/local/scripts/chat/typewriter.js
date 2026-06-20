import { signal } from '../../../../store.js';
import { BASE, hdrs } from '../../../../components/shared/api.js';
import { renderMarkdownLight } from './renderizar.js';

const CHAR_DELAY = 8;

export const typewriterEnabled = signal(true);
export const typewriterText    = signal('');

let _timer = null;
let _typing = false;

export async function cargarTypewriterState() {
  try {
    const res = await fetch(`${BASE}/db/ajustes/gemita_typewriter`, { headers: hdrs() });
    if (res.ok) {
      const data = await res.json();
      typewriterEnabled.value = data.valor !== '0' && data.valor !== 'false';
    }
  } catch {}
}

export function isTypewriterEnabled() {
  return typewriterEnabled.value;
}

export async function toggleTypewriter() {
  typewriterEnabled.value = !typewriterEnabled.value;
  try {
    await fetch(`${BASE}/db/ajustes/gemita_typewriter`, {
      method: 'PUT',
      headers: hdrs(),
      body: JSON.stringify({ valor: typewriterEnabled.value ? '1' : '0' }),
    });
  } catch {}
  return typewriterEnabled.value;
}

export function iniciarTypewriter(nuevoTexto, onComplete) {
  if (!typewriterEnabled.value) {
    onComplete(renderMarkdownLight(nuevoTexto));
    return;
  }

  detenerTypewriter();
  _typing = true;

  const chars = nuevoTexto.split('');
  let index = 0;

  function typeNext() {
    if (index >= chars.length) {
      _typing = false;
      typewriterText.value = '';
      onComplete(renderMarkdownLight(nuevoTexto));
      return;
    }
    typewriterText.value = renderMarkdownLight(chars.slice(0, index + 1).join(''));
    index++;
    _timer = setTimeout(typeNext, CHAR_DELAY);
  }

  typeNext();
}

export function detenerTypewriter() {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
  _typing = false;
  typewriterText.value = '';
}

export function getTypewriterText() {
  if (!_typing) return null;
  return typewriterText.value;
}

export function isTyping() {
  return _typing;
}
