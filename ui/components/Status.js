const { html } = globalThis;

const TONES = {
  ok: 'text-aurora-success border-aurora-success',
  warn: 'text-aurora-warning border-aurora-warning',
  err: 'text-aurora-error border-aurora-error',
  loading: 'text-aurora-text-dim border-aurora-border',
};

export function Status({ tone = 'loading', children }) {
  return html`
    <div class=${['rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors', TONES[tone] || TONES.loading].join(' ')}>
      ${children}
    </div>
  `;
}
