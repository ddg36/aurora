const { html } = globalThis;

// Luna nacarada en la esquina top-left, con glow del acento.
const R = 320;

export function Luna() {
  const lunaStyle = `
    position: fixed;
    top: ${-R}px;
    left: ${-R}px;
    width: ${R * 2}px;
    height: ${R * 2}px;
    border-radius: 50%;
    pointer-events: none;
    z-index: 2;
    background: radial-gradient(
      circle at 38% 38%,
      rgba(255,255,255,0.22)  0%,
      rgba(255,255,255,0.30)  30%,
      rgba(255,255,255,0.38)  58%,
      rgba(255,255,255,0.66)  76%,
      rgba(255,255,255,0.10)  90%,
      transparent             100%
    );
    box-shadow:
      0 0  35px  7px  color-mix(in srgb, var(--aurora-accent) 45%, transparent),
      0 0  80px 18px  color-mix(in srgb, var(--aurora-accent) 25%, transparent),
      0 0 150px 45px  color-mix(in srgb, var(--aurora-accent) 12%, transparent);
  `;

  const tintStyle = `
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
    background: radial-gradient(
      circle at center,
      transparent                                              55%,
      color-mix(in srgb, var(--aurora-accent) 18%, transparent)  80%,
      color-mix(in srgb, var(--aurora-accent) 35%, transparent)  92%,
      color-mix(in srgb, var(--aurora-accent) 20%, transparent) 100%
    );
  `;

  const glowStyle = `
    position: absolute;
    inset: -65px;
    border-radius: 50%;
    background: radial-gradient(
      circle at center,
      color-mix(in srgb, var(--aurora-accent) 30%, transparent)  0%,
      color-mix(in srgb, var(--aurora-accent) 18%, transparent) 45%,
      color-mix(in srgb, var(--aurora-accent)  8%, transparent) 70%,
      transparent 100%
    );
    filter: blur(24px);
    opacity: 0.6;
    animation: luna-pulse 7s ease-in-out infinite;
    pointer-events: none;
  `;

  return html`
    <div style=${lunaStyle}>
      <div style=${tintStyle}></div>
      <div style=${glowStyle}></div>
    </div>
  `;
}
