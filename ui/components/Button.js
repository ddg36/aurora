import { iconButtonClass, ICON_BTN_SIZE, BTN_HEIGHT, BTN_SAFE } from './shared/iconButton.js';
import { Icon, splitIconLabel } from './Icon.js';

const { html } = globalThis;

export function Button({ onClick, variant, size, active, disabled, title, icon, iconOnly, shape, btnRef, class: cls, children }) {
  const normalized = icon ? { icon, label: children } : splitIconLabel(children);
  // Ícono-solo: EL MISMO tamaño que NavBar/Footer (ICON_BTN_SIZE, una sola
  // variable) — no una talla "parecida" propia, para que un ícono-solo se
  // vea idéntico esté donde esté (chrome o contenido).
  if (iconOnly) {
    const clsx = iconButtonClass(active, [
      'au-button au-button-icon btn-icon-only',
      ICON_BTN_SIZE,
      shape === 'circle' ? 'rounded-full' : 'rounded-md',
      variant === 'primary' && 'border-aurora-accent text-aurora-accent',
      variant === 'danger'  && 'border-aurora-error text-aurora-error',
      disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
      cls,
    ].filter(Boolean).join(' '));
    return html`
      <button type="button" ref=${btnRef} class=${clsx} onClick=${onClick} disabled=${disabled} title=${title} aria-pressed=${active == null ? undefined : String(Boolean(active))}>
        ${normalized.icon ? html`<${Icon} name=${normalized.icon} size=${16} />` : normalized.label}
      </button>
    `;
  }

  const clsx = [
    'au-button inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors',
    'border rounded-md px-3 text-sm font-medium',
    BTN_HEIGHT, BTN_SAFE,
    'border-aurora-border bg-aurora-surface-2 text-aurora-text',
    !variant && !active && 'fx-hover',
    variant === 'primary' && 'au-button-primary',
    variant === 'danger'  && 'au-button-danger',
    size === 'sm'         && 'au-button-sm px-2 text-xs',
    active                && 'fx-active',
    disabled              && 'opacity-40 cursor-not-allowed pointer-events-none',
    cls,
  ].filter(Boolean).join(' ');

  return html`
    <button type="button" ref=${btnRef} class=${clsx} onClick=${onClick} disabled=${disabled} title=${title} aria-pressed=${active == null ? undefined : String(Boolean(active))}>
      ${normalized.icon && html`<${Icon} name=${normalized.icon} size=${16} />`}
      ${normalized.label}
    </button>
  `;
}
