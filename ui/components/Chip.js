const { html } = globalThis;

const VARIANTS = {
  yt: { color: '#f87171', background: 'color-mix(in srgb, #f87171 10%, transparent)', borderColor: 'color-mix(in srgb, #f87171 25%, transparent)' },
  accent: { color: 'var(--aurora-accent)', background: 'color-mix(in srgb, var(--aurora-accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--aurora-accent) 25%, transparent)' },
  muted: { color: 'var(--aurora-text-muted)', background: 'transparent', borderColor: 'transparent' },
  dim: { color: 'var(--aurora-text-dim)', background: 'transparent', borderColor: 'transparent' },
};

export function Chip({ active, variant, onClick, children }) {
  const base = [
    'inline-flex items-center px-2.5 py-1 text-xs rounded-md border cursor-pointer transition-colors min-h-7',
    active ? 'border-aurora-accent text-aurora-accent fx-active' : 'border-aurora-border text-aurora-text fx-hover',
  ].join(' ');
  const style = variant ? VARIANTS[variant] : null;

  return html`<span class=${base} style=${style ? `color:${style.color};background:${style.background};border-color:${style.borderColor};` : ''} onClick=${onClick}>${children}</span>`;
}

export function ChipGroup({ children }) {
  return html`<div class="flex flex-wrap gap-1.5">${children}</div>`;
}
