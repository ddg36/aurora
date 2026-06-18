const { html } = globalThis;

export function Empty({ icon, title, children }) {
  return html`
    <div class="flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
      ${icon  && html`<div class="text-3xl opacity-40">${icon}</div>`}
      ${title && html`<div class="text-sm font-semibold text-aurora-text-dim">${title}</div>`}
      ${children && html`<div class="text-xs text-aurora-text-muted max-w-xs leading-relaxed">${children}</div>`}
    </div>
  `;
}
