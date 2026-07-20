// Loaders lazy. La selección de escena ya no cambia al alternar claro/oscuro:
// `mode` se entrega al componente para que adapte su paleta sin desmontarse por
// una identidad visual distinta.
const { h } = globalThis.preact;
const V = '?v=v20-scene-budget';
const load = (file) => import(`${file}${V}`);

const DEFINITIONS = {
  starfield: ['Starfield.js', 'Starfield', 'RemakeStarfield', 'LightStarfield'],
  void: ['Void.js', 'Void', 'RemakeVoid', 'LightVoid'],
  clouds: ['Clouds.js', 'Clouds', 'RemakeClouds', 'LightClouds'],
  nebula: ['Nebula.js', 'Nebula', 'RemakeNebula', 'LightNebula'],
  aurora: ['Aurora.js', 'Aurora', 'RemakeAurora', 'LightAurora'],
  particles: ['Particles.js', 'Particles', 'RemakeParticles', 'LightParticles'],
  matrix: ['Matrix.js', 'Matrix', 'RemakeMatrix', 'LightMatrix'],
  grid: ['Grid.js', 'Grid', 'RemakeGrid', 'LightGrid'],
  rain: ['Rain.js', 'Rain', 'RemakeRain', 'LightRain'],
  glitch: ['Glitch.js', 'Glitch', 'RemakeGlitch', 'LightGlitch'],
  fireflies: ['Fireflies.js', 'Fireflies', 'RemakeFireflies', 'LightFireflies'],
  castle: ['Castle.js', 'Castle', 'RemakeCastle', 'LightCastle'],
  blood: ['Blood.js', 'Blood', 'RemakeBlood', 'LightBlood'],
  ash: ['Ash.js', 'Ash', 'RemakeAsh', 'LightAsh'],
  fog: ['Fog.js', 'Fog', 'RemakeFog', 'LightFog'],
  ravens: ['Ravens.js', 'Ravens', 'RemakeRavens', 'LightRavens'],
  abyss: ['Abyss.js', 'Abyss', 'RemakeAbyss', 'LightAbyss'],
  depths: ['Depths.js', 'Depths', 'RemakeDepths', 'LightDepths'],
  hellfire: ['Hellfire.js', 'Hellfire', 'RemakeHellfire', 'LightHellfire'],
  lava: ['Lava.js', 'Lava', 'RemakeLava', 'LightLava'],
  sakura: ['Sakura.js', 'Sakura', 'RemakeSakura', 'LightSakura'],
  autumn: ['Autumn.js', 'Autumn', 'RemakeAutumn', 'LightAutumn'],
  moonlit: ['Moonlit.js', 'Moonlit', 'RemakeMoonlit', 'LightMoonlit'],
  blizzard: ['Blizzard.js', 'Blizzard', 'RemakeBlizzard', 'LightBlizzard'],
  tundra: ['Tundra.js', 'Tundra', 'RemakeTundra', 'LightTundra'],
};

function frame(Comp, family, luminance, sceneId) {
  if (typeof Comp !== 'function') return null;
  return function BackgroundFrame({ mode = 'dark' }) {
    return h('div', {
      class: 'aurora-scene-host',
      'data-family': family,
      'data-luminance': luminance,
      'data-scene': sceneId,
      'data-mode': mode,
      'aria-hidden': 'true',
    },
      h(Comp, { mode }),
      sceneId === 'lyria' && family === 'remake'
        ? h('div', { class: 'aurora-lyria-presence' },
            h('img', { src: '/ui/assets/lyria-canon-v3-alpha.png', alt: '', decoding: 'async', loading: 'eager' }))
        : null,
      h('div', { class: 'aurora-scene-scrim' }),
    );
  };
}

function remake(id, exportName) {
  return () => load('./Remake.js').then(m => frame(m[exportName], 'remake', 'mixed', id));
}
function classicNight(id, file, exportName) {
  return () => load(`./${file}`).then(m => frame(m[exportName], 'classic-night', 'dark', id));
}
function classicDay(id, exportName) {
  return () => load('./light.js').then(m => frame(m[exportName], 'classic-day', 'light', id));
}

export const BACKGROUND_LOADERS = {};
for (const [id, [file, darkExport, remakeExport, lightExport]] of Object.entries(DEFINITIONS)) {
  // El ID histórico conserva el fondo nocturno original para no cambiar
  // preferencias guardadas. Remake y Día son elecciones explícitas.
  BACKGROUND_LOADERS[id] = classicNight(id, file, darkExport);
  BACKGROUND_LOADERS[`${id}-remake`] = remake(id, remakeExport);
  BACKGROUND_LOADERS[`${id}-classic-day`] = classicDay(id, lightExport);
}

// Luna dejó de ser HUD: ahora es una escena de fondo adaptativa.
BACKGROUND_LOADERS['luna-remake'] = remake('luna', 'RemakeLuna');
BACKGROUND_LOADERS['lyria-remake'] = remake('lyria', 'RemakeLyria');
