import { Icon } from './Icon.js';

const { html } = globalThis;
const cx = (...parts) => parts.filter(Boolean).join(' ');

export function ToolPage({ children, class: cls, wide = false }) {
  return html`<div class=${cx('tool-page', wide && 'tool-page-wide', cls)}>${children}</div>`;
}

export function ToolHeader({ icon, eyebrow, title, description, actions, class: cls }) {
  return html`
    <header class=${cx('tool-header', cls)}>
      <div class="tool-header-copy">
        ${eyebrow && html`<span class="tool-eyebrow">${eyebrow}</span>`}
        <div class="tool-title-row">
          ${icon && html`<span class="tool-title-icon"><${Icon} name=${icon} size=${17}/></span>`}
          <h1 class="tool-title">${title}</h1>
        </div>
        ${description && html`<p class="tool-subtitle">${description}</p>`}
      </div>
      ${actions && html`<div class="tool-header-actions">${actions}</div>`}
    </header>
  `;
}

export function ToolSection({ title, description, meta, children, class: cls, flush = false }) {
  return html`
    <section class=${cx('tool-section', flush && 'tool-section-flush', cls)}>
      ${(title || description || meta) && html`
        <header class="tool-section-header">
          <div class="tool-section-copy">
            ${title && html`<h2>${title}</h2>`}
            ${description && html`<p>${description}</p>`}
          </div>
          ${meta && html`<div class="tool-section-meta">${meta}</div>`}
        </header>
      `}
      <div class="tool-section-body">${children}</div>
    </section>
  `;
}

export function MetricStrip({ children, class: cls }) {
  return html`<div class=${cx('tool-metric-strip', cls)}>${children}</div>`;
}

export function Metric({ icon, label, value, detail, accent = false }) {
  return html`
    <div class=${cx('tool-metric', accent && 'is-accent')}>
      ${icon && html`<span class="tool-metric-icon"><${Icon} name=${icon} size=${15}/></span>`}
      <div class="tool-metric-copy"><strong>${value ?? '—'}</strong><span>${label}</span></div>
      ${detail && html`<small>${detail}</small>`}
    </div>
  `;
}
