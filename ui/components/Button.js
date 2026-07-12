import { iconButtonClass, ICON_BTN_SIZE, BTN_HEIGHT, BTN_SAFE } from './shared/iconButton.js';

const { html } = globalThis;

export function Button({ onClick, variant, size, active, disabled, title, iconOnly, shape, btnRef, class: cls, children }) {
  // Ícono-solo: EL MISMO tamaño que NavBar/Footer (ICON_BTN_SIZE, una sola
  // variable) — no una talla "parecida" propia, para que un ícono-solo se
  // vea idéntico esté donde esté (chrome o contenido).
  if (iconOnly) {
    const clsx = iconButtonClass(active, [
      'btn-icon-only border',
      ICON_BTN_SIZE,
      shape === 'circle' ? 'rounded-full' : 'rounded-md',
      variant === 'primary' && 'border-aurora-accent text-aurora-accent',
      variant === 'danger'  && 'border-aurora-error text-aurora-error',
      disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      cls,
    ].filter(Boolean).join(' '));
    return html`
      <button type="button" ref=${btnRef} class=${clsx} onClick=${onClick} disabled=${disabled} title=${title}>
        ${children}
      </button>
    `;
  }

  const clsx = [
    'inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors',
    'border rounded-md px-3 text-sm font-medium',
    BTN_HEIGHT, BTN_SAFE,
    'border-aurora-border bg-aurora-surface-2 text-aurora-text',
    !variant && !active && 'fx-hover',
    variant === 'primary' && 'border-aurora-accent text-aurora-accent fx-hover',
    variant === 'danger'  && 'border-aurora-error text-aurora-error fx-danger',
    size === 'sm'         && 'px-2 text-xs',
    active                && 'fx-active',
    disabled              && 'opacity-40 cursor-not-allowed pointer-events-none',
    cls,
  ].filter(Boolean).join(' ');

  return html`
    <button type="button" ref=${btnRef} class=${clsx} onClick=${onClick} disabled=${disabled} title=${title}>
      ${children}
    </button>
  `;
}
