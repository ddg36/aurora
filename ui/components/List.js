const { html } = globalThis;
import { Icon, resolveIconName } from './Icon.js';

export function List({ children, class: cls, layout = 'list' }) {
  return html`<div class=${['au-list', layout === 'grid' ? 'grid' : 'flex flex-col', 'gap-0.5', cls].filter(Boolean).join(' ')}>${children}</div>`;
}

export function ListItem({ icon, name, sub, info, onClick, children, class: cls }) {
  return html`
    <div class=${['au-list-item flex items-center gap-2 px-3 py-2 transition-colors', onClick && 'cursor-pointer', cls].filter(Boolean).join(' ')} onClick=${onClick}>
      ${icon && html`<span class="au-list-icon">${resolveIconName(icon) ? html`<${Icon} name=${icon} size=${16} />` : icon}</span>`}
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
  return html`<div class="au-list-actions flex items-center gap-1">${children}</div>`;
}
