const { html } = globalThis;

// Trazos de circuito en los bordes, fluyendo con acento.
export function Circuit() {
  const accent = 'var(--aurora-accent)';

  return html`
    <div class="fixed inset-0 pointer-events-none overflow-hidden" style="z-index:2">
      <div
        class="absolute pointer-events-none top-0 left-0 w-0.5 h-full"
        style=${`background: linear-gradient(to bottom, transparent 0%, ${accent} 20%, transparent 40%, ${accent} 60%, transparent 80%, ${accent} 100%); background-size: 100% 200%; animation: circuit-flow 4s linear infinite; opacity: 0.6`}
      ></div>
      <div
        class="absolute pointer-events-none top-0 right-0 w-0.5 h-full"
        style=${`background: linear-gradient(to bottom, ${accent} 0%, transparent 30%, ${accent} 50%, transparent 70%, ${accent} 90%, transparent 100%); background-size: 100% 200%; animation: circuit-flow 4s linear infinite reverse; opacity: 0.6`}
      ></div>
      <div
        class="absolute pointer-events-none top-0 left-0 w-full h-0.5"
        style=${`background: linear-gradient(to right, transparent 0%, ${accent} 15%, transparent 35%, ${accent} 55%, transparent 75%, ${accent} 90%, transparent 100%); background-size: 200% 100%; animation: circuit-flow-h 5s linear infinite; opacity: 0.55`}
      ></div>
      <div
        class="absolute pointer-events-none bottom-0 left-0 w-full h-0.5"
        style=${`background: linear-gradient(to right, transparent 0%, ${accent} 15%, transparent 35%, ${accent} 55%, transparent 75%, ${accent} 90%, transparent 100%); background-size: 200% 100%; animation: circuit-flow-h 5s linear infinite reverse; opacity: 0.55`}
      ></div>
    </div>
  `;
}
