const { html } = globalThis;

const accent = 'var(--aurora-accent)';
const accentSoft = 'color-mix(in srgb, var(--aurora-accent) 24%, transparent)';
const edgeDim = 'var(--aurora-edge-dim)';
const glow = 'var(--aurora-edge-glow)';
const textMuted = 'var(--aurora-text-muted, #6b7280)';
const surface = 'var(--aurora-surface, #fff)';

function hud(variant) {
  return function LightHudVariant() {
    return html`<${LightHud} variant=${variant} />`;
  };
}

function SparkField({ count = 16, warm = false, radius = 18 }) {
  return html`
    <div class="fixed inset-0 pointer-events-none overflow-hidden" style="z-index:2">
      ${Array.from({ length: count }, (_, i) => {
        const left = (i * 73 + 11) % 100;
        const top = 7 + ((i * 41) % 86);
        const size = 2 + (i % 5);
        const color = warm ? `color-mix(in srgb, var(--aurora-edge-dim) 58%, #fff7ed)` : `color-mix(in srgb, var(--aurora-accent) ${22 + (i % 4) * 6}%, transparent)`;
        return html`<span key=${i} class="absolute rounded-full" style=${`left:${left}%;top:${top}%;width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${radius}px ${color};animation:aurora-pulse ${3.2 + i * .13}s ease-in-out infinite ${i * .11}s`}></span>`;
      })}
    </div>
  `;
}

function LightHud({ variant }) {
  if (variant === 'luna') {
    return html`
      <div class="fixed pointer-events-none" style="z-index:2;top:-120px;right:-100px;width:390px;height:390px;border-radius:999px;background:radial-gradient(circle at 48% 48%, rgba(255,255,255,.95), color-mix(in srgb,var(--aurora-edge-dim) 38%, #fff7ed) 32%, color-mix(in srgb,var(--aurora-accent) 24%, transparent) 58%, transparent 74%);box-shadow:0 0 95px ${glow},0 0 190px color-mix(in srgb,var(--aurora-accent) 18%, transparent);opacity:.86"></div>
    `;
  }

  if (variant === 'pulse-rings' || variant === 'sonar') {
    const rings = [0, 1, 2, 3, 4].map((_, i) => html`
      <span key=${i} class="absolute rounded-full" style=${`width:${118 + i * 72}px;height:${118 + i * 72}px;border:1px solid color-mix(in srgb,var(--aurora-accent) ${30 - i * 3}%, transparent);animation:pulse-ring-expand ${3.4 + i * .25}s ease-out infinite ${i * .34}s;opacity:.5`}></span>
    `);
    const sweep = variant === 'sonar' ? html`<div class="absolute w-1/2 h-1/2 left-1/2 top-1/2 origin-left" style="background:conic-gradient(from 0deg,color-mix(in srgb,var(--aurora-accent) 18%, transparent),transparent 38%);animation:compass-spin 8s linear infinite;opacity:.45"></div>` : null;
    return html`
      <div class="fixed inset-0 pointer-events-none flex items-center justify-center" style="z-index:2">${sweep}${rings}</div>
    `;
  }

  if (variant === 'scanlines') {
    return html`<div class="fixed inset-0 pointer-events-none" style="z-index:2;background:repeating-linear-gradient(0deg, transparent 0 6px, color-mix(in srgb,var(--aurora-edge-dim) 12%, transparent) 7px 8px);opacity:.9"></div>`;
  }

  if (variant === 'circuit') {
    const nodes = Array.from({ length: 16 }, (_, i) => {
      const left = 8 + ((i * 19) % 84);
      const top = 10 + ((i * 31) % 80);
      return html`<span key=${i} class="absolute rounded-full" style=${`left:${left}%;top:${top}%;width:5px;height:5px;background:color-mix(in srgb,var(--aurora-accent) 44%, transparent);box-shadow:0 0 14px ${glow}`}></span>`;
    });
    return html`
      <div class="fixed inset-0 pointer-events-none" style="z-index:2;opacity:.9">
        <div class="absolute inset-x-0 top-0 h-px" style="background:linear-gradient(90deg,transparent,${accent},transparent)"></div>
        <div class="absolute inset-x-0 bottom-0 h-px" style="background:linear-gradient(90deg,transparent,${accentSoft},transparent)"></div>
        <div class="absolute inset-y-0 left-0 w-px" style="background:linear-gradient(180deg,transparent,${accent},transparent)"></div>
        <div class="absolute inset-y-0 right-0 w-px" style="background:linear-gradient(180deg,transparent,${accentSoft},transparent)"></div>
        ${nodes}
      </div>
    `;
  }

  if (variant === 'corners') {
    const b = '2px solid color-mix(in srgb,var(--aurora-accent) 54%, transparent)';
    const box = 'position:absolute;width:64px;height:64px;filter:drop-shadow(0 0 10px ' + glow + ');opacity:.88';
    return html`
      <div class="fixed inset-0 pointer-events-none" style="z-index:2">
        <span style=${`${box};top:14px;left:14px;border-top:${b};border-left:${b}`}></span>
        <span style=${`${box};top:14px;right:14px;border-top:${b};border-right:${b}`}></span>
        <span style=${`${box};bottom:14px;left:14px;border-bottom:${b};border-left:${b}`}></span>
        <span style=${`${box};bottom:14px;right:14px;border-bottom:${b};border-right:${b}`}></span>
      </div>
    `;
  }

  if (variant === 'candles') {
    return html`<${SparkField} count=${12} warm=${true} radius=${24} />`;
  }

  if (variant === 'runes') {
    const marks = ['ᚨ', 'ᛟ', 'ᚱ', 'ᛞ', 'ᛉ', 'ᚷ', 'ᛗ', 'ᛋ'];
    return html`
      <div class="fixed inset-0 pointer-events-none overflow-hidden" style="z-index:2;color:${accentSoft};font:22px serif;letter-spacing:.08em">
        ${marks.map((m, i) => html`<span key=${i} class="absolute" style=${`left:${(i*17+8)%96}%;top:${(i*29+12)%88}%;opacity:.24;animation:aurora-pulse ${4+i*.3}s ease-in-out infinite ${i*.2}s`}>${m}</span>`)}
      </div>
    `;
  }

  if (variant === 'drip') {
    return html`
      <div class="fixed inset-0 pointer-events-none overflow-hidden" style="z-index:2">
        ${Array.from({ length: 12 }, (_, i) => html`<span key=${i} class="absolute rounded-full" style=${`left:${8+i*8}%;top:${(i*23)%80}%;width:5px;height:${18+(i%5)*9}px;background:linear-gradient(180deg,${accent},transparent);border-radius:999px;opacity:.28;filter:blur(.1px)`}></span>`)}
      </div>
    `;
  }

  if (variant === 'ember') {
    return html`<${SparkField} count=${22} warm=${true} radius=${28} />`;
  }

  if (variant === 'torii') {
    return html`
      <div class="fixed inset-x-0 bottom-8 pointer-events-none flex justify-center" style="z-index:2;opacity:.34;color:var(--aurora-accent)">
        <div style="width:min(520px,72vw);height:128px;border-top:3px solid currentColor;border-bottom:1px solid color-mix(in srgb,currentColor 45%, transparent);position:relative">
          <span style="position:absolute;left:22%;top:0;width:3px;height:128px;background:currentColor"></span>
          <span style="position:absolute;right:22%;top:0;width:3px;height:128px;background:currentColor"></span>
          <span style="position:absolute;left:0;right:0;top:38px;height:2px;background:color-mix(in srgb,currentColor 55%, transparent)"></span>
        </div>
      </div>
    `;
  }

  if (variant === 'compass') {
    return html`
      <div class="fixed right-8 top-14 pointer-events-none rounded-full" style="z-index:2;width:132px;height:132px;border:1px solid color-mix(in srgb,var(--aurora-accent) 36%, transparent);box-shadow:0 0 24px ${glow};background:color-mix(in srgb, ${surface} 72%, transparent)">
        <div class="absolute inset-3 rounded-full" style=${`border:1px dashed ${textMuted}`}></div>
        <span style="position:absolute;left:50%;top:12px;width:1px;height:108px;background:${accent};transform:translateX(-50%)"></span>
        <span style="position:absolute;top:50%;left:12px;height:1px;width:108px;background:${textMuted};opacity:.45;transform:translateY(-50%)"></span>
        <span style="position:absolute;left:50%;top:18px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:16px solid var(--aurora-accent);transform:translateX(-50%);filter:drop-shadow(0 0 8px var(--aurora-accent))"></span>
      </div>
    `;
  }

  return null;
}

export const LightLuna = hud('luna');
export const LightPulseRings = hud('pulse-rings');
export const LightScanlines = hud('scanlines');
export const LightCircuit = hud('circuit');
export const LightCorners = hud('corners');
export const LightCandles = hud('candles');
export const LightRunes = hud('runes');
export const LightDrip = hud('drip');
export const LightSonar = hud('sonar');
export const LightEmber = hud('ember');
export const LightTorii = hud('torii');
export const LightCompass = hud('compass');
