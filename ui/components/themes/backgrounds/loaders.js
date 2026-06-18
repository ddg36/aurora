// Loaders lazy — solo se importa el background activo y su variante día/noche.
const V = '?v=v2-visual-variants-1';
const load = (file) => import(`${file}${V}`);
const light = (name) => load('./light.js').then(m => m[name]);

export const BACKGROUND_LOADERS = {
  // 🌌 Cósmico
  void:      (mode) => mode === 'light' ? light('LightVoid')      : load('./Void.js').then(m => m.Void),
  starfield: (mode) => mode === 'light' ? light('LightStarfield') : load('./Starfield.js').then(m => m.Starfield),
  clouds:    (mode) => mode === 'light' ? light('LightClouds')    : load('./Clouds.js').then(m => m.Clouds),
  nebula:    (mode) => mode === 'light' ? light('LightNebula')    : load('./Nebula.js').then(m => m.Nebula),
  aurora:    (mode) => mode === 'light' ? light('LightAurora')    : load('./Aurora.js').then(m => m.Aurora),
  particles: (mode) => mode === 'light' ? light('LightParticles') : load('./Particles.js').then(m => m.Particles),

  // ⚡ Cyberpunk
  matrix:    (mode) => mode === 'light' ? light('LightMatrix')    : load('./Matrix.js').then(m => m.Matrix),
  grid:      (mode) => mode === 'light' ? light('LightGrid')      : load('./Grid.js').then(m => m.Grid),
  rain:      (mode) => mode === 'light' ? light('LightRain')      : load('./Rain.js').then(m => m.Rain),
  glitch:    (mode) => mode === 'light' ? light('LightGlitch')    : load('./Glitch.js').then(m => m.Glitch),
  fireflies: (mode) => mode === 'light' ? light('LightFireflies') : load('./Fireflies.js').then(m => m.Fireflies),

  // 🦇 Gótico
  castle:    (mode) => mode === 'light' ? light('LightCastle')    : load('./Castle.js').then(m => m.Castle),
  blood:     (mode) => mode === 'light' ? light('LightBlood')     : load('./Blood.js').then(m => m.Blood),
  ash:       (mode) => mode === 'light' ? light('LightAsh')       : load('./Ash.js').then(m => m.Ash),
  fog:       (mode) => mode === 'light' ? light('LightFog')       : load('./Fog.js').then(m => m.Fog),
  ravens:    (mode) => mode === 'light' ? light('LightRavens')    : load('./Ravens.js').then(m => m.Ravens),

  // 🌊 Abismal
  abyss:     (mode) => mode === 'light' ? light('LightAbyss')     : load('./Abyss.js').then(m => m.Abyss),
  depths:    (mode) => mode === 'light' ? light('LightDepths')    : load('./Depths.js').then(m => m.Depths),

  // 🔥 Infernal
  hellfire:  (mode) => mode === 'light' ? light('LightHellfire')  : load('./Hellfire.js').then(m => m.Hellfire),
  lava:      (mode) => mode === 'light' ? light('LightLava')      : load('./Lava.js').then(m => m.Lava),

  // 🌸 Sakura
  sakura:    (mode) => mode === 'light' ? light('LightSakura')    : load('./Sakura.js').then(m => m.Sakura),
  autumn:    (mode) => mode === 'light' ? light('LightAutumn')    : load('./Autumn.js').then(m => m.Autumn),
  moonlit:   (mode) => mode === 'light' ? light('LightMoonlit')   : load('./Moonlit.js').then(m => m.Moonlit),

  // ❄️ Ártico
  blizzard:  (mode) => mode === 'light' ? light('LightBlizzard')  : load('./Blizzard.js').then(m => m.Blizzard),
  tundra:    (mode) => mode === 'light' ? light('LightTundra')    : load('./Tundra.js').then(m => m.Tundra),
};
