const { html } = globalThis;

// Los HUD v4 no dibujan una segunda escena. El wrapper de App ya expone
// `data-hud`; este marcador mantiene un componente real y accesible mientras
// interface.css aplica el lenguaje visual a controles y superficies existentes.
function marker(id) {
  return function InterfaceHud() {
    return html`<span class="aurora-interface-hud-marker" data-style=${id} aria-hidden="true"></span>`;
  };
}

export const PulseRings = marker('pulse-rings');
export const Scanlines = marker('scanlines');
export const Circuit = marker('circuit');
export const Corners = marker('corners');
export const Candles = marker('candles');
export const Runes = marker('runes');
export const Drip = marker('drip');
export const Sonar = marker('sonar');
export const Ember = marker('ember');
export const Torii = marker('torii');
export const Compass = marker('compass');
