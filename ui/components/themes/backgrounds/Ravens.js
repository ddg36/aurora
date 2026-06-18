const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Ravens — siluetas de cuervos volando en la oscuridad.
export class Ravens extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#dc2626');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0;

    const makeRaven = () => ({
      x:       Math.random() * (W || 800),
      y:       60 + Math.random() * ((H || 600) * 0.6),
      speed:   0.4 + Math.random() * 0.8,
      size:    8 + Math.random() * 14,
      flapPhase: Math.random() * Math.PI * 2,
      flapSpeed: 0.08 + Math.random() * 0.06,
      alpha:   0.5 + Math.random() * 0.4,
      dir:     Math.random() > 0.5 ? 1 : -1,
      vy:      (Math.random() - 0.5) * 0.2,
    });

    const drawRaven = (r) => {
      const flap = Math.sin(t * r.flapSpeed * 60 + r.flapPhase);
      const wingAngle = flap * 0.5;
      const s = r.size;

      ctx.save();
      ctx.translate(r.x, r.y);
      ctx.scale(r.dir, 1);
      ctx.globalAlpha = r.alpha;
      ctx.fillStyle = '#000';

      // cuerpo
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.5, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();

      // ala izquierda
      ctx.save();
      ctx.rotate(-wingAngle);
      ctx.beginPath();
      ctx.moveTo(-s * 0.1, 0);
      ctx.bezierCurveTo(-s * 0.5, -s * 0.6, -s * 1.1, -s * 0.3, -s * 0.9, s * 0.1);
      ctx.bezierCurveTo(-s * 0.6, s * 0.15, -s * 0.2, s * 0.05, -s * 0.1, 0);
      ctx.fill();
      ctx.restore();

      // ala derecha
      ctx.save();
      ctx.rotate(wingAngle);
      ctx.beginPath();
      ctx.moveTo(s * 0.1, 0);
      ctx.bezierCurveTo(s * 0.5, -s * 0.6, s * 1.1, -s * 0.3, s * 0.9, s * 0.1);
      ctx.bezierCurveTo(s * 0.6, s * 0.15, s * 0.2, s * 0.05, s * 0.1, 0);
      ctx.fill();
      ctx.restore();

      // cabeza y pico
      ctx.beginPath();
      ctx.arc(s * 0.45, -s * 0.05, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.62, -s * 0.04);
      ctx.lineTo(s * 0.82, -s * 0.01);
      ctx.lineTo(s * 0.62, s * 0.06);
      ctx.fill();

      ctx.restore();
    };

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    let ravens;
    const draw = () => {
      t++;
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [139, 92, 246];
      ctx.fillStyle = `rgba(${Math.round(ar*0.01)},${Math.round(ag*0.004)},${Math.round(ab*0.016)},0.2)`;
      ctx.fillRect(0, 0, W, H);

      // luna de fondo
      const lx = W * 0.78, ly = H * 0.18, lr = 55;
      const moonGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
      moonGrad.addColorStop(0, `rgba(${Math.min(ar+120,255)},${Math.min(ag+100,255)},${Math.min(ab+120,255)},0.18)`);
      moonGrad.addColorStop(0.6, `rgba(${Math.min(ar+60,255)},${Math.min(ag+40,255)},${Math.min(ab+80,255)},0.06)`);
      moonGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = moonGrad;
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fill();

      // acento sutil en el suelo
      const groundGrad = ctx.createLinearGradient(0, H * 0.75, 0, H);
      groundGrad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
      groundGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0.04)`);
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, H * 0.75, W, H * 0.25);

      for (const r of ravens) {
        r.x += r.speed * r.dir;
        r.y += r.vy + Math.sin(t * 0.02 + r.flapPhase) * 0.3;
        if (r.x > W + 60)  { r.x = -60; r.y = 60 + Math.random() * H * 0.6; }
        if (r.x < -60)     { r.x = W + 60; r.y = 60 + Math.random() * H * 0.6; }
        drawRaven(r);
      }

      this._raf = requestAnimationFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    ravens = Array.from({ length: 12 }, makeRaven);
    draw();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#010002;will-change:transform"/>`;
  }
}
