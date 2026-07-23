const { html } = globalThis;
import { Icon, resolveIconName } from './Icon.js';

// Header togglable full-width (icono + título + badge de conteo + flecha ▲/▼)
// que revela/oculta contenido. Reemplaza el patrón repetido a mano en
// captura/ (Historial, Capítulos, Chat) — un <button> full-width con
// hover:bg-aurora-surface-hover y una flecha que gira según `open`.
//
// open/onToggle: estado controlado por el caller.
// title: texto del header. icon: emoji opcional a la izquierda.
// count: número opcional → badge de acento. compact: variante más chica
//        (text-[10px], py-1.5, con border-top) para paneles anidados.
export function Disclosure({ open, onToggle, title, icon, count, compact, children }) {
  const btnCls = [
    'au-disclosure flex w-full items-center gap-2 text-left font-semibold text-aurora-text-muted transition-colors',
    compact ? 'px-3 py-1.5 text-[10px] border-t border-aurora-border' : 'px-3 py-2 text-xs',
  ].join(' ');

  return html`
    <button type="button" class=${btnCls} onClick=${onToggle}>
      ${icon && html`<span class="au-disclosure-icon">${resolveIconName(icon) ? html`<${Icon} name=${icon} size=${15} />` : icon}</span>`}
      <span>${title}</span>
      ${count != null && html`
        <span class="rounded-full bg-aurora-accent/15 px-2 py-0.5 text-[9px] font-bold text-aurora-accent">${count}</span>
      `}
      <${Icon} class=${`ml-auto au-disclosure-chevron ${open ? 'is-open' : ''}`} name="chevronDown" size=${14} />
    </button>
    ${open && children}
  `;
}
