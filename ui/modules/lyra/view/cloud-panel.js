const html = (...args) => globalThis.html(...args);

// usaExtPane: en modo extensión el iframe del LLM NO va inline (anidado dentro
// de Aurora → rompía login por cookie partitioning). Va montado a nivel de
// EXTENSIÓN (hijo directo de chrome-extension) sobre este placeholder — la
// extensión lo dibuja encima siguiendo el rect que Aurora reporta. Fuera de
// extensión, fallback al iframe inline de siempre.
export function CloudPanel({ visible, expanded, hidden, aiLabel, iframeRef, usaExtPane, onExpand, onReload, onClose }) {
  return html`
    <div class=${'cloud-panel ' + (expanded ? 'expanded' : hidden ? 'hidden-mode' : 'mini') + (visible ? '' : ' cloud-panel-hidden')}>
      ${!expanded && visible && html`
        <div class="cloud-mini-header">
          <span class="cloud-mini-label">☁ ${aiLabel}</span>
          <div class="cloud-mini-actions">
            <button class="cloud-mini-btn" title="Expandir" onClick=${onExpand}>⛶</button>
            <button class="cloud-mini-btn" title="Recargar" onClick=${onReload}>↺</button>
            <button class="cloud-mini-btn cloud-mini-btn--close" title="Cerrar" onClick=${onClose}>✕</button>
          </div>
        </div>
      `}
      <div class="cloud-panel-iframe-wrap" style="position:relative;">
        ${usaExtPane
          ? html`<div data-llm-pane="cloud" class="cloud-panel-ext-hole" style="width:100%;height:100%;"></div>`
          : html`<iframe
              data-pane="cloud"
              src="about:blank"
              ref=${iframeRef}
              allow="clipboard-read; clipboard-write; microphone"
              title="Cloud Backend"
              tabIndex="-1"
            ></iframe>`}
        ${!expanded && html`
          <div
            class="cloud-panel-shield"
            onClick=${e => e.stopPropagation()}
            title="Cloud Backend en miniatura"
          ></div>
        `}
      </div>
    </div>
  `;
}
