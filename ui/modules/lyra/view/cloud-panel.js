const html = (...args) => globalThis.html(...args);

export function CloudPanel({ visible, expanded, hidden, aiLabel, iframeRef, onExpand, onReload, onClose }) {
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
        <iframe
          data-pane="cloud"
          src="about:blank"
          ref=${iframeRef}
          allow="clipboard-read; clipboard-write; microphone"
          title="Cloud Backend"
          tabIndex="-1"
        ></iframe>
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
