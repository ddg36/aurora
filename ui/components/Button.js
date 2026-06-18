const { html } = globalThis;

export function Button({ onClick, variant, size, active, disabled, title, class: cls, children }) {
  const clsx = [
    'inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors',
    'border rounded-md px-3 py-1.5 text-sm font-medium min-h-8',
    'border-aurora-border bg-aurora-surface-2 text-aurora-text',
    !variant && !active && 'fx-hover',
    variant === 'primary' && 'border-aurora-accent text-aurora-accent fx-hover',
    variant === 'danger'  && 'border-aurora-error text-aurora-error fx-danger',
    size === 'sm'         && 'px-2 py-1 text-xs min-h-7',
    active                && 'fx-active',
    disabled              && 'opacity-40 cursor-not-allowed pointer-events-none',
    cls,
  ].filter(Boolean).join(' ');

  return html`
    <button class=${clsx} onClick=${onClick} disabled=${disabled} title=${title}>
      ${children}
    </button>
  `;
}
