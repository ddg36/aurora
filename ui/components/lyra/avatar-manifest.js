// Identidad visual desacoplada de la UI. Las futuras poses se registran aquí;
// ninguna superficie necesita conocer nombres de archivo ni inventar fallbacks.
export const LYRIA_AVATAR = Object.freeze({
  id: 'lyria',
  name: 'Lyria',
  fallback: '/ui/assets/lyria-canon-v3-alpha.png',
  states: Object.freeze({
    offline: null,
    ready: null,
    listening: null,
    thinking: null,
    working: null,
    speaking: null,
    'tool-use': null,
    waiting: null,
    interrupted: null,
    error: null,
    complete: null,
    compacting: null,
  }),
  moods: Object.freeze({
    neutral: null,
    happy: null,
    annoyed: null,
    sad: null,
    curious: null,
    surprised: null,
    focused: null,
  }),
  // Una combinación concreta puede ganar sobre las capas generales.
  // Ejemplo futuro: 'thinking:annoyed': '/ui/assets/lyria/...png'.
  variants: Object.freeze({}),
});

export const AVATAR_STATE_LABELS = Object.freeze({
  offline: 'Desconectada',
  ready: 'Lista',
  listening: 'Escuchando',
  thinking: 'Pensando',
  working: 'Trabajando',
  speaking: 'Hablando',
  'tool-use': 'Usando herramienta',
  waiting: 'Esperando',
  interrupted: 'Interrumpida',
  error: 'Atención requerida',
  complete: 'Terminado',
  compacting: 'Conservando memoria',
});

export function avatarAsset(manifest = LYRIA_AVATAR, state = 'ready', mood = 'neutral') {
  return manifest.variants?.[`${state}:${mood}`]
    || manifest.moods?.[mood]
    || manifest.states?.[state]
    || manifest.states?.ready
    || manifest.fallback;
}

export function avatarStateLabel(state = 'ready') {
  return AVATAR_STATE_LABELS[state] || state;
}
