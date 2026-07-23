const { html } = globalThis;

export function Panel({ stat, interactive, active, direction = 'column', onClick, children, class: cls, iframeMode }) {
  const base = [
    'au-panel flex',
    direction === 'row' ? 'au-panel-row' : 'au-panel-column',
    !iframeMode && 'overflow-hidden',
    iframeMode && 'overflow-visible',
    stat        && 'items-center justify-center p-4 text-center',
    interactive && 'cursor-pointer transition-colors fx-panel',
    active      && 'fx-active',
    cls,
  ].filter(Boolean).join(' ');

  return html`<div class=${base} onClick=${onClick}>${children}</div>`;
}

export function PanelHeader({ children }) {
  return html`
    <div class="au-panel-header flex items-center justify-between flex-shrink-0">
      ${children}
    </div>
  `;
}

export function PanelBody({ children, noPadding, class: extCls }) {
  const cls = ['au-panel-body', noPadding ? 'flex-1 min-h-0 overflow-visible' : 'p-3 flex-1 min-h-0', extCls].filter(Boolean).join(' ');
  return html`<div class=${cls}>${children}</div>`;
}

export function PanelFooter({ children }) {
  return html`
    <div class="au-panel-footer flex items-center gap-2 flex-shrink-0">
      ${children}
    </div>
  `;
}

export function PanelLabel({ children }) {
  return html`<div class="au-label text-xs font-bold text-aurora-text-muted uppercase">${children}</div>`;
}

export function PanelValue({ children }) {
  return html`<div class="au-value text-2xl font-bold text-aurora-text">${children}</div>`;
}
