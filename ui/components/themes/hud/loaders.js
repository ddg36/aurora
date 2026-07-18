// HUD v4: una sola implementación adaptativa que decora la interfaz real.
const V = '?v=v4-interface-hud-1';
const load = () => import(`./Interface.js${V}`);
const pick = (name) => () => load().then(m => m[name]);

export const HUD_LOADERS = {
  'pulse-rings': pick('PulseRings'),
  scanlines: pick('Scanlines'),
  circuit: pick('Circuit'),
  corners: pick('Corners'),
  candles: pick('Candles'),
  runes: pick('Runes'),
  drip: pick('Drip'),
  sonar: pick('Sonar'),
  ember: pick('Ember'),
  torii: pick('Torii'),
  compass: pick('Compass'),
};
