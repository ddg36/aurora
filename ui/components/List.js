const { html } = globalThis;

export function List({ children }) {
  return html`<div class="flex flex-col gap-0.5">${children}</div>`;
}

export function ListItem({ icon, name, sub, info, onClick, children }) {
  return html`
    <div class="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer fx-item transition-colors" onClick=${onClick}>
      ${icon && html`<span class="text-base w-5 text-center flex-shrink-0 text-aurora-text-dim">${icon}</span>`}
      ${(name || sub || info) && html`
        <div class="flex-1 min-w-0">
          ${name && html`<div class="text-sm text-aurora-text truncate">${name}</div>`}
          ${(sub || info) && html`<div class="text-xs text-aurora-text-muted truncate">${sub || info}</div>`}
        </div>
      `}
      ${children}
    </div>
  `;
}

export function ListActions({ children }) {
  return html`<div class="flex items-center gap-1">${children}</div>`;
}
