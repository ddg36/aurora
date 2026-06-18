const { html } = globalThis;

// 4 marcos tácticos en las esquinas, pulsando con acento.
export function Corners() {
  const base = 'absolute w-12 h-12 pointer-events-none';
  const corner = (pos, borders, shadow, delay) => html`
    <div
      class=${base}
      style=${`${pos}; border-top: ${borders.top}; border-right: ${borders.right}; border-bottom: ${borders.bottom}; border-left: ${borders.left}; box-shadow: ${shadow}; animation: corners-pulse 3s ease-in-out infinite ${delay}`}
    ></div>
  `;

  const b = '2px solid var(--aurora-accent)';

  return html`
    <div class="fixed inset-0 pointer-events-none" style="z-index:2">
      ${corner('top:12px;left:12px',     { top: b, left: b },          'inset 8px 8px 0 -6px var(--aurora-accent)',   '0s')}
      ${corner('top:12px;right:12px',    { top: b, right: b },         'inset -8px 8px 0 -6px var(--aurora-accent)',  '0.4s')}
      ${corner('bottom:12px;left:12px',  { bottom: b, left: b },       'inset 8px -8px 0 -6px var(--aurora-accent)',  '0.8s')}
      ${corner('bottom:12px;right:12px', { bottom: b, right: b },      'inset -8px -8px 0 -6px var(--aurora-accent)', '1.2s')}
    </div>
  `;
}
