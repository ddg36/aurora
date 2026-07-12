import { BTN_HEIGHT, BTN_SAFE } from './shared/iconButton.js';

const { html } = globalThis;

const TONES = {
  ok: 'text-aurora-success border-aurora-success',
  warn: 'text-aurora-warning border-aurora-warning',
  err: 'text-aurora-error border-aurora-error',
  loading: 'text-aurora-text-dim border-aurora-border',
};

export function Status({ tone = 'loading', title, children }) {
  return html`
    <div class=${['inline-flex items-center rounded-md border px-3 text-xs font-semibold transition-colors', BTN_HEIGHT, BTN_SAFE, TONES[tone] || TONES.loading].join(' ')} title=${title}>
      ${children}
    </div>
  `;
}
