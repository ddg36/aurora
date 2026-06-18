// UI/THEMES/HUD — Mapa id → componente.
// Aurora renderiza el HUD activo según state.hud.

import { Luna }       from './Luna.js';
import { Scanlines }  from './Scanlines.js';
import { Corners }    from './Corners.js';
import { PulseRings } from './PulseRings.js';
import { Circuit }    from './Circuit.js';

export const HUD_COMPONENTS = {
  luna:          Luna,
  scanlines:     Scanlines,
  corners:       Corners,
  'pulse-rings': PulseRings,
  circuit:       Circuit,
};
