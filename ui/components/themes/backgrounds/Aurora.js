const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano } from '../lib.js';

const TAU = Math.PI * 2;

function curtainPath(ctx, x, top, bottom, width, phase, t, i) {
  const left = [];
  const right = [];
  const steps = 36;
  for (let s = 0; s <= steps; s++) {
    const k = s / steps;
    const y = top + k * (bottom - top);
    const wave = Math.sin(y * 0.018 + t * 3.2 + phase + i * 0.6) * width * (0.35 + k * 0.7);
    const ray = Math.sin(y * 0.047 + t * 5.1 + i) * width * (0.12 + k * 0.38);
    left.push([x + wave + ray, y]);
    right.push([x + width + wave - ray, y]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
}

export class Aurora extends Component {
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
    let W, H, t = 0, stars;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      stars = Array.from({ length: Math.max(70, Math.round((W * H) / 22000 * (esDispositivoLiviano() ? 0.3 : 1))) }, () => ({
        x: Math.random() * W,
        y: Math.random() * H * .72,
        r: .4 + Math.random() * 1.5,
        a: .16 + Math.random() * .58,
        p: Math.random() * TAU,
      }));
    };

    const drawRays = (r, g, b, t) => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const NRAYS = esDispositivoLiviano() ? 8 : 18;
      for (let i = 0; i < NRAYS; i++) {
        const x0 = (i / (NRAYS - 1)) * W + Math.sin(t * 1.6 + i) * 42;
        const top = H * (0.03 + (i % 4) * 0.018);
        const bottom = H * (0.72 + Math.sin(t + i) * 0.05);
        const width = W * (0.022 + (i % 3) * 0.012);
        const grad = ctx.createLinearGradient(x0, top, x0 + width * .4, bottom);
        grad.addColorStop(0, `rgba(${Math.min(255, r + 70)},${Math.min(255, g + 90)},${Math.min(255, b + 80)},.34)`);
        grad.addColorStop(.28, `rgba(${r},${Math.min(255, g + 80)},${Math.min(255, b + 70)},.22)`);
        grad.addColorStop(.62, `rgba(${Math.min(255, r + 40)},${g},${Math.min(255, b + 100)},.12)`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        curtainPath(ctx, x0, top, bottom, width, t + i, t, i);
        ctx.fill();

        ctx.strokeStyle = `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 110)},${Math.min(255, b + 90)},.18)`;
        ctx.lineWidth = 1.1;
        const rays = 8;
        ctx.beginPath();
        for (let j = 0; j <= rays; j++) {
          const k = j / rays;
          const y = top + k * (bottom - top);
          const drift = Math.sin(y * 0.022 + t * 4.2 + i) * width * .55 + k * width * .5;
          const x = x0 + drift;
          if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    const draw = () => {
      t += 0.004;
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [139, 92, 246];
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, `rgb(${Math.max(0, Math.round(ar * 0.018))},${Math.max(2, Math.round(ag * 0.035))},${Math.max(12, Math.round(ab * 0.09))})`);
      sky.addColorStop(.55, `rgb(${Math.max(0, Math.round(ar * 0.008))},${Math.max(1, Math.round(ag * 0.018))},${Math.max(6, Math.round(ab * 0.05))})`);
      sky.addColorStop(1, '#010205');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      for (const s of stars || []) {
        s.p += .012;
        ctx.fillStyle = `rgba(225,242,255,${s.a * (.55 + .45 * Math.sin(s.p))})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      drawRays(ar, ag, ab, t);
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
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1; opacity:0.78; will-change:transform"/>`;
  }
}
