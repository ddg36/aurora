const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano } from '../lib.js';

const TAU = Math.PI * 2;

function cloudLobe(ctx, x, y, rx, ry, color, alpha, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(-rx * .22, -ry * .34, 0, 0, 0, Math.max(rx, ry) * 1.08);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(.52, rgba(color, alpha * .48));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function rgba(c, a) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

function cloud(ctx, x, y, w, h, accent, alpha, t, phase) {
  const body = [96, 108, 146];
  const light = [178, 190, 230];
  const shadow = [34, 44, 78];
  const moonTint = mix(accent, [255, 255, 255], .62);
  const scale = Math.min(w / 320, h / 90);
  const drift = Math.sin(t * .35 + phase) * 10;
  const baseY = h * .58;

  ctx.save();
  ctx.translate(x + drift, y);
  ctx.scale(scale, scale);
  ctx.globalCompositeOperation = 'source-over';

  cloudLobe(ctx, -150, baseY + 20, 118, 28, shadow, alpha * .18, .04);
  cloudLobe(ctx, -58, baseY + 24, 146, 34, shadow, alpha * .22, -.03);
  cloudLobe(ctx, 70, baseY + 22, 126, 30, shadow, alpha * .18, .02);

  const bodyGrad = ctx.createLinearGradient(0, -64, 0, baseY + 34);
  bodyGrad.addColorStop(0, rgba(mix(body, light, .42), alpha * .22));
  bodyGrad.addColorStop(.45, rgba(body, alpha * .18));
  bodyGrad.addColorStop(1, rgba(shadow, alpha * .10));
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-176, baseY + 12);
  ctx.bezierCurveTo(-168, baseY - 24, -132, baseY - 44, -104, baseY - 30);
  ctx.bezierCurveTo(-104, baseY - 66, -54, -74, -26, baseY - 42);
  ctx.bezierCurveTo(-8, -78, 48, -78, 68, baseY - 38);
  ctx.bezierCurveTo(98, -62, 150, -44, 178, baseY - 12);
  ctx.bezierCurveTo(204, baseY + 20, 148, baseY + 44, 80, baseY + 36);
  ctx.bezierCurveTo(8, baseY + 46, -122, baseY + 42, -176, baseY + 12);
  ctx.fill();

  cloudLobe(ctx, -126, 10, 58, 38, body, alpha * .24, -.08);
  cloudLobe(ctx, -76, -8, 72, 54, body, alpha * .28, .05);
  cloudLobe(ctx, -18, -18, 86, 64, body, alpha * .34, -.02);
  cloudLobe(ctx, 50, -8, 78, 58, body, alpha * .29, .04);
  cloudLobe(ctx, 118, 8, 62, 40, body, alpha * .24, -.06);

  cloudLobe(ctx, -154, 18, 58, 16, mix(body, light, .32), alpha * .12, .03);
  cloudLobe(ctx, 136, 18, 54, 15, mix(body, light, .32), alpha * .12, -.03);
  cloudLobe(ctx, -96, -24, 42, 24, light, alpha * .18, .05);
  cloudLobe(ctx, -26, -28, 96, 38, mix(body, light, .58), alpha * .26, .01);
  cloudLobe(ctx, 52, -26, 72, 30, mix(accent, light, .32), alpha * .18, -.02);
  cloudLobe(ctx, 104, -16, 48, 26, moonTint, alpha * .10, -.04);

  for (let i = 0; i < 9; i++) {
    const px = -150 + i * 32;
    const py = baseY - 10 + Math.sin(t * .45 + phase + i * .8) * 4;
    const a = alpha * (.045 + (i % 3) * .014);
    cloudLobe(ctx, px, py, 28 + (i % 3) * 14, 8 + (i % 4) * 3, mix(body, light, .42), a, (i % 2 ? 1 : -1) * .09);
  }

  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(-18, -12, 0, -18, -12, 220);
  glow.addColorStop(0, rgba(accent, alpha * .13));
  glow.addColorStop(.42, rgba(accent, alpha * .05));
  glow.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(-18, -12, 220, 82, 0, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

export class Clouds extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#8b5cf6');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, t = 0;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const draw = () => {
      t += .006;
      const [r, g, b] = this.accent.state?.rgb ?? this.accent.rgb ?? [139, 92, 246];
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#02030a');
      sky.addColorStop(.48, `rgb(${Math.max(2, Math.round(r * .018))},${Math.max(2, Math.round(g * .012))},${Math.max(12, Math.round(b * .045))})`);
      sky.addColorStop(1, '#050612');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      const moonX = W * .78;
      const moonY = H * .18;
      const moon = ctx.createRadialGradient(moonX - 18, moonY - 20, 0, moonX, moonY, Math.min(W, H) * .24);
      moon.addColorStop(0, 'rgba(220,230,255,.28)');
      moon.addColorStop(.35, `rgba(${r},${g},${b},.10)`);
      moon.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = moon;
      ctx.fillRect(0, 0, W, H);

      const NCLOUDS = esDispositivoLiviano() ? 6 : 13;
      for (let i = 0; i < NCLOUDS; i++) {
        const layer = i % 4;
        const speed = 7 + layer * 3.2;
        const x = ((i * 285 + t * speed) % (W + 640)) - 320;
        const y = H * (.09 + (i % 5) * .145) + Math.sin(t * .45 + i) * 12;
        const w = 305 + layer * 78 + Math.sin(t * .2 + i) * 22;
        const h = 82 + (i % 3) * 24;
        const alpha = .14 + layer * .028 + (i % 2) * .012;
        cloud(ctx, x, y, w, h, [r, g, b], alpha, t, i);
      }

      ctx.fillStyle = 'rgba(255,255,255,.18)';
      const NSTARS = esDispositivoLiviano() ? 30 : 80;
      for (let i = 0; i < NSTARS; i++) {
        const x = (i * 137 + Math.sin(t + i) * 20) % W;
        const y = (i * 83) % (H * .72);
        const a = .18 + .32 * Math.abs(Math.sin(t * .5 + i));
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(x, y, .7 + (i % 3) * .35, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      this._raf = requestAnimationFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    draw();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#02030a;will-change:transform" />`;
  }
}
