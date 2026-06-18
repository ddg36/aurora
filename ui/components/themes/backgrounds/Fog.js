const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Fog — niebla densa que se mueve lentamente. Ambiente gótico.
export class Fog extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#6366f1');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0;
    const layers = Array.from({ length: 6 }, (_, i) => ({
      x:     Math.random() * 1000,
      y:     Math.random() * 600,
      r:     180 + Math.random() * 220,
      speed: 0.08 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2,
      drift: (Math.random() - 0.5) * 0.3,
    }));

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
      layers.forEach(l => { l.x = Math.random() * W; l.y = Math.random() * H; });
    };

    const draw = () => {
      t += 0.004;
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [139, 92, 246];

      ctx.fillStyle = `rgba(${Math.round(ar*0.01)},${Math.round(ag*0.005)},${Math.round(ab*0.025)},0.28)`;
      ctx.fillRect(0, 0, W, H);

      for (const l of layers) {
        l.x += l.drift + Math.sin(t + l.phase) * 0.3;
        l.y += Math.cos(t * 0.7 + l.phase) * 0.15;
        if (l.x > W + l.r) l.x = -l.r;
        if (l.x < -l.r)    l.x = W + l.r;

        const alpha = 0.025 + 0.015 * Math.sin(t * l.speed + l.phase);
        const grad  = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
        grad.addColorStop(0,   `rgba(${ar},${ag},${ab},${alpha * 3})`);
        grad.addColorStop(0.4, `rgba(${ar},${ag},${ab},${alpha})`);
        grad.addColorStop(1,   `rgba(${ar},${ag},${ab},0)`);

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // niebla base en el suelo
      const groundGrad = ctx.createLinearGradient(0, H * 0.6, 0, H);
      groundGrad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
      groundGrad.addColorStop(1, `rgba(${ar},${ag},${ab},0.06)`);
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, H * 0.6, W, H * 0.4);

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
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#010004;will-change:transform"/>`;
  }
}
