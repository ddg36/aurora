// HUD v5: una sola implementación adaptativa que decora la interfaz real.
const V = '?v=v9-lyria-presence-1';
const load = () => import(`./Interface.js${V}`);
const pick = (name) => () => load().then(m => m[name]);

export const HUD_LOADERS = {
  lyria: pick('Lyria'),
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
