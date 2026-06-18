const { html } = globalThis;

// 4 anillos concéntricos pulsando desde el centro.
export function PulseRings() {
  return html`
    <div class="fixed inset-0 pointer-events-none flex items-center justify-center" style="z-index:0">
      ${[0, 0.8, 1.6, 2.4].map(delay => html`
        <div
          class="absolute pointer-events-none"
          style=${`width:80px; height:80px; border-radius:50%; border:1.5px solid var(--aurora-accent); opacity:0; animation: pulse-ring-expand 3.2s ease-out infinite ${delay}s`}
        ></div>
      `)}
    </div>
  `;
}
