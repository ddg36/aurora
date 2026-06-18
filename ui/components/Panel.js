const { html } = globalThis;

export function Panel({ stat, interactive, active, onClick, children, class: cls, iframeMode }) {
  const base = [
    'flex flex-col bg-aurora-surface border border-aurora-border rounded-md',
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
    <div class="flex items-center justify-between px-3 py-2 border-b border-aurora-border bg-aurora-surface flex-shrink-0">
      ${children}
    </div>
  `;
}

export function PanelBody({ children, noPadding, class: extCls }) {
  const cls = [noPadding ? 'flex-1 min-h-0 overflow-visible' : 'p-3 flex-1 min-h-0', extCls].filter(Boolean).join(' ');
  return html`<div class=${cls}>${children}</div>`;
}

export function PanelFooter({ children }) {
  return html`
    <div class="flex items-center gap-2 px-3 py-2 border-t border-aurora-border bg-aurora-bg flex-shrink-0">
      ${children}
    </div>
  `;
}

export function PanelLabel({ children }) {
  return html`<div class="text-xs font-bold text-aurora-text-muted uppercase" style="letter-spacing:0">${children}</div>`;
}

export function PanelValue({ children }) {
  return html`<div class="text-2xl font-bold text-aurora-text">${children}</div>`;
}
