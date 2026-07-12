import { BTN_HEIGHT, BTN_SAFE } from './shared/iconButton.js';

const { html } = globalThis;

const VARIANTS = {
  yt: { color: '#f87171', background: 'color-mix(in srgb, #f87171 10%, transparent)', borderColor: 'color-mix(in srgb, #f87171 25%, transparent)' },
  accent: { color: 'var(--aurora-accent)', background: 'color-mix(in srgb, var(--aurora-accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--aurora-accent) 25%, transparent)' },
  muted: { color: 'var(--aurora-text-muted)', background: 'transparent', borderColor: 'transparent' },
  dim: { color: 'var(--aurora-text-dim)', background: 'transparent', borderColor: 'transparent' },
};

export function Chip({ active, variant, accentColor, padX, onClick, title, disabled, class: cls, children }) {
  const base = [
    'inline-flex items-center text-xs rounded-md border cursor-pointer transition-colors',
    BTN_HEIGHT, BTN_SAFE,
    padX == null && 'px-2.5',
    !accentColor && (active ? 'border-aurora-accent text-aurora-accent fx-active' : 'border-aurora-border text-aurora-text fx-hover'),
    disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
    cls,
  ].filter(Boolean).join(' ');

  let style = variant ? VARIANTS[variant] : null;
  if (accentColor) {
    style = active
      ? { color: 'var(--aurora-text)', background: `color-mix(in srgb, ${accentColor} 18%, var(--aurora-surface))`, borderColor: accentColor }
      : { color: 'var(--aurora-text-muted)', background: `color-mix(in srgb, ${accentColor} 8%, var(--aurora-surface))`, borderColor: `color-mix(in srgb, ${accentColor} 34%, var(--aurora-border))` };
  }
  // padX (px number) llega de useAutoFitRow cuando la fila está comprimiendo
  // espaciado — Chips normales (padX==null) usan la clase px-2.5 de siempre.
  const inlineStyle = [
    padX != null && `padding-left:${padX}px;padding-right:${padX}px;`,
    style && `color:${style.color};background:${style.background};border-color:${style.borderColor};`,
  ].filter(Boolean).join('');

  return html`<span class=${base} style=${inlineStyle || undefined} onClick=${disabled ? undefined : onClick} title=${title}>${children}</span>`;
}

export function ChipGroup({ class: cls, rowRef, gap, children }) {
  const style = gap != null ? `gap:${gap}px;` : undefined;
  return html`<div ref=${rowRef} class=${['flex flex-wrap', gap == null && 'gap-1.5', cls].filter(Boolean).join(' ')} style=${style}>${children}</div>`;
}
