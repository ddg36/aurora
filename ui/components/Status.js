import { BTN_HEIGHT, BTN_SAFE } from './shared/iconButton.js';
import { Icon, splitIconLabel } from './Icon.js';

const { html } = globalThis;

const TONES = {
  ok: 'text-aurora-success border-aurora-success',
  warn: 'text-aurora-warning border-aurora-warning',
  err: 'text-aurora-error border-aurora-error',
  loading: 'text-aurora-text-dim border-aurora-border',
};

export function Status({ tone = 'loading', title, children }) {
  const normalized = splitIconLabel(children);
  return html`
    <div class=${['au-status inline-flex items-center px-3 text-xs font-semibold transition-colors', `au-status-${tone}`, BTN_HEIGHT, BTN_SAFE, TONES[tone] || TONES.loading].join(' ')} title=${title}>
      ${normalized.icon && html`<${Icon} name=${normalized.icon} size=${14} />`}${normalized.label}
    </div>
  `;
}
