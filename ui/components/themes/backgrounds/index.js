// UI/THEMES/BACKGROUNDS — Mapa id → componente.
// Aurora renderiza el background activo según state.background.

import { Void }      from './Void.js';
import { Grid }      from './Grid.js';
import { Matrix }    from './Matrix.js';
import { Aurora }    from './Aurora.js';
import { Fireflies } from './Fireflies.js';
import { Particles } from './Particles.js';
import { Starfield } from './Starfield.js';
import { Nebula }    from './Nebula.js';

export const BACKGROUND_COMPONENTS = {
  void:      Void,
  grid:      Grid,
  matrix:    Matrix,
  aurora:    Aurora,
  fireflies: Fireflies,
  particles: Particles,
  starfield: Starfield,
  nebula:    Nebula,
};
