const { html } = globalThis;

export function Toolbar({ title, compact, children }) {
  const cls = [
    'au-toolbar flex items-center gap-2 flex-shrink-0',
    compact ? 'px-2 py-1' : 'px-3 py-2',
  ].join(' ');

  return html`
    <div class=${cls}>
      ${title && html`<span class="au-label text-xs font-bold text-aurora-text-muted uppercase flex-shrink-0">${title}</span>`}
      <div class="flex items-center gap-1 ml-auto">${children}</div>
    </div>
  `;
}

export function ToolbarSpacer() {
  return html`<span class="flex-1"></span>`;
}
