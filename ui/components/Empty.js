const { html } = globalThis;
import { Icon, resolveIconName } from './Icon.js';

export function Empty({ icon, title, description, children }) {
  const iconName = resolveIconName(icon) || (typeof icon === 'string' ? icon : null);
  const body = description || children;
  return html`
    <div class="au-empty flex flex-col items-center justify-center gap-2 py-8 px-4 text-center">
      ${icon && html`<div class="au-empty-icon">${iconName ? html`<${Icon} name=${iconName} size=${24} />` : icon}</div>`}
      ${title && html`<div class="text-sm font-semibold text-aurora-text-dim">${title}</div>`}
      ${body && html`<div class="text-xs text-aurora-text-muted max-w-xs leading-relaxed">${body}</div>`}
    </div>
  `;
}
