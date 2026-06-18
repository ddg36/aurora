const { html } = globalThis;

// Overlay CRT — líneas horizontales con flicker leve.
export function Scanlines() {
  return html`
    <div
      class="fixed inset-0 pointer-events-none"
      style="z-index:2;
             background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px);
             animation: scanlines-flicker 0.15s steps(1) infinite"
    ></div>
  `;
}
