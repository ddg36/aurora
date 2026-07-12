const { html } = globalThis;

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
    'flex w-full items-center gap-2 text-left font-semibold text-aurora-text-muted transition-colors hover:bg-aurora-surface-hover',
    compact ? 'px-3 py-1.5 text-[10px] border-t border-aurora-border' : 'px-3 py-2 text-xs',
  ].join(' ');

  return html`
    <button type="button" class=${btnCls} onClick=${onToggle}>
      ${icon && html`<span>${icon}</span>`}
      <span>${title}</span>
      ${count != null && html`
        <span class="rounded-full bg-aurora-accent/15 px-2 py-0.5 text-[9px] font-bold text-aurora-accent">${count}</span>
      `}
      <span class="ml-auto text-[9px] opacity-50">${open ? '▲' : '▼'}</span>
    </button>
    ${open && children}
  `;
}
