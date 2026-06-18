// Loaders lazy — solo se importa el HUD activo y su variante día/noche.
const V = '?v=v2-visual-variants-1';
const load = (file) => import(`${file}${V}`);
const light = (name) => load('./light.js').then(m => m[name]);

export const HUD_LOADERS = {
  // 🌌 Cósmico
  luna:          (mode) => mode === 'light' ? light('LightLuna')       : load('./Luna.js').then(m => m.Luna),
  'pulse-rings': (mode) => mode === 'light' ? light('LightPulseRings') : load('./PulseRings.js').then(m => m.PulseRings),

  // ⚡ Cyberpunk
  scanlines:     (mode) => mode === 'light' ? light('LightScanlines')  : load('./Scanlines.js').then(m => m.Scanlines),
  circuit:       (mode) => mode === 'light' ? light('LightCircuit')    : load('./Circuit.js').then(m => m.Circuit),
  corners:       (mode) => mode === 'light' ? light('LightCorners')    : load('./Corners.js').then(m => m.Corners),

  // 🦇 Gótico
  candles:       (mode) => mode === 'light' ? light('LightCandles')    : load('./Candles.js').then(m => m.Candles),
  runes:         (mode) => mode === 'light' ? light('LightRunes')      : load('./Runes.js').then(m => m.Runes),
  drip:          (mode) => mode === 'light' ? light('LightDrip')       : load('./Drip.js').then(m => m.Drip),

  // 🌊 Abismal
  sonar:         (mode) => mode === 'light' ? light('LightSonar')      : load('./Sonar.js').then(m => m.Sonar),

  // 🔥 Infernal
  ember:         (mode) => mode === 'light' ? light('LightEmber')      : load('./Ember.js').then(m => m.Ember),

  // 🌸 Sakura
  torii:         (mode) => mode === 'light' ? light('LightTorii')      : load('./Torii.js').then(m => m.Torii),

  // ❄️ Ártico
  compass:       (mode) => mode === 'light' ? light('LightCompass')    : load('./Compass.js').then(m => m.Compass),
};
