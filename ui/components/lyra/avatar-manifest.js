// Identidad visual desacoplada de la UI. Las futuras poses se registran aquí;
// ninguna superficie necesita conocer nombres de archivo ni inventar fallbacks.
export const LYRIA_AVATAR = Object.freeze({
  id: 'lyria',
  name: 'Lyria',
  kind: 'character',
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

// Identidad provisional para el participante Cloud. No inventa arte final ni
// reutiliza la imagen de Lyria: AvatarFigure lo representa como presencia
// abstracta hasta que cada proveedor tenga su manifest visual definitivo.
export function createCloudAvatarManifest({ id = 'cloud', name = 'Cloud', icon = 'cloud' } = {}) {
  return Object.freeze({
    id,
    name,
    icon,
    kind: 'provider',
    fallback: null,
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
    moods: Object.freeze({ neutral: null, focused: null, curious: null }),
    variants: Object.freeze({}),
  });
}

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
    || manifest.fallback
    || null;
}

export function avatarStateLabel(state = 'ready') {
  return AVATAR_STATE_LABELS[state] || state;
}
