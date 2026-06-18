const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Agujero negro con partículas en espiral.
export class Void extends Component {
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
    let W, H, cx, cy, particles;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      cx = W / 2;
      cy = H / 2;
    };

    const makeParticle = () => {
      const angle = Math.random() * Math.PI * 2;
      const dist  = 120 + Math.random() * Math.min(W, H) * 0.42;
      const layer = Math.random();
      return {
        angle, dist,
        speed:   (0.003 + Math.random() * 0.006) * (1 + (1 - layer) * 1.5),
        inSpeed: 0.12 + Math.random() * 0.25,
        r:       0.5 + Math.random() * 1.8 * layer,
        alpha:   0.15 + Math.random() * 0.7,
        layer,
      };
    };

    const draw = () => {
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [139, 92, 246];
      ctx.fillStyle = `rgba(${Math.round(ar*0.01)},${Math.round(ag*0.005)},${Math.round(ab*0.015)},0.2)`;
      ctx.fillRect(0, 0, W, H);
      const EVENT_R = 38;

      const discGrad = ctx.createRadialGradient(cx, cy, EVENT_R * 0.6, cx, cy, EVENT_R * 4.5);
      discGrad.addColorStop(0,   `rgba(${ar},${ag},${ab},0.35)`);
      discGrad.addColorStop(0.3, `rgba(${ar},${ag},${ab},0.12)`);
      discGrad.addColorStop(0.7, `rgba(${ar},${ag},${ab},0.04)`);
      discGrad.addColorStop(1,   `rgba(${ar},${ag},${ab},0)`);
      ctx.fillStyle = discGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, EVENT_R * 4.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, EVENT_R, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();

      for (const p of particles) {
        p.angle += p.speed;
        p.dist  -= p.inSpeed;
        if (p.dist < EVENT_R + 2) {
          p.dist  = 130 + Math.random() * Math.min(W, H) * 0.42;
          p.angle = Math.random() * Math.PI * 2;
          p.alpha = 0.15 + Math.random() * 0.7;
        }
        const x = cx + Math.cos(p.angle) * p.dist;
        const y = cy + Math.sin(p.angle) * p.dist * 0.38;
        const proximity = Math.max(0, (p.dist - EVENT_R) / 80);
        const alpha = p.alpha * Math.min(1, proximity);

        const glow = ctx.createRadialGradient(x, y, 0, x, y, p.r * 4);
        glow.addColorStop(0,   `rgba(${ar},${ag},${ab},${alpha * 0.8})`);
        glow.addColorStop(0.5, `rgba(${ar},${ag},${ab},${alpha * 0.2})`);
        glow.addColorStop(1,   `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.9})`;
        ctx.fill();
      }
      this._raf = requestAnimationFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    const [_vr, _vg, _vb] = this.accent.state?.rgb ?? [139, 92, 246];
    ctx.fillStyle = `rgb(${Math.max(2,Math.round(_vr*0.02))},${Math.max(2,Math.round(_vg*0.01))},${Math.max(5,Math.round(_vb*0.04))})`;
    ctx.fillRect(0, 0, W, H);
    particles = Array.from({ length: 180 }, makeParticle);
    draw();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1; background:#020008; will-change:transform"/>`;
  }
}
