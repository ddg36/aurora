import { signal } from '../../store.js';

export const LYRIA_MOODS = Object.freeze([
  'neutral',
  'happy',
  'annoyed',
  'sad',
  'curious',
  'surprised',
  'focused',
]);

export const lyriaMood = signal('neutral');

let moodResetTimer = null;

export function setLyriaMood(mood = 'neutral', { resetAfter = 0 } = {}) {
  const nextMood = LYRIA_MOODS.includes(mood) ? mood : 'neutral';
  lyriaMood.value = nextMood;
  clearTimeout(moodResetTimer);
  moodResetTimer = resetAfter > 0 && nextMood !== 'neutral'
    ? setTimeout(() => { lyriaMood.value = 'neutral'; }, resetAfter)
    : null;
  return nextMood;
}

// Puente deliberadamente explícito: voz, herramientas o futuras reglas de
// personaje pueden cambiar el ánimo sin mezclarlo con el estado operativo.
globalThis.addEventListener?.('lyria:avatar-mood', event => {
  const detail = event.detail;
  if (typeof detail === 'string') setLyriaMood(detail);
  else setLyriaMood(detail?.mood, { resetAfter: detail?.resetAfter });
});
