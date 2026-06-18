const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Neon Rain — lluvia de gotas neón estilo Blade Runner. Sin caracteres.
export class Rain extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#ec4899');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, drops;

    const makeDrop = () => ({
      x:      Math.random() * (W || 800),
      y:      Math.random() * (H || 600) * -1,
      len:    8 + Math.random() * 24,
      speed:  3 + Math.random() * 6,
      width:  0.5 + Math.random() * 1.2,
      alpha:  0.4 + Math.random() * 0.5,
      glowR:  1.5 + Math.random() * 3,
    });

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const draw = () => {
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [139, 92, 246];
      ctx.fillStyle = `rgba(${Math.round(ar*0.012)},${Math.round(ag*0.006)},${Math.round(ab*0.02)},0.2)`;
      ctx.fillRect(0, 0, W, H);

      for (const d of drops) {
        d.y += d.speed;
        if (d.y - d.len > H) {
          d.y = -d.len;
          d.x = Math.random() * W;
        }

        // gota principal
        const grad = ctx.createLinearGradient(d.x, d.y - d.len, d.x, d.y);
        grad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
        grad.addColorStop(0.6, `rgba(${ar},${ag},${ab},${d.alpha * 0.6})`);
        grad.addColorStop(1, `rgba(255,255,255,${d.alpha})`);

        ctx.beginPath();
        ctx.moveTo(d.x, d.y - d.len);
        ctx.lineTo(d.x, d.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = d.width;
        ctx.stroke();

        // glow en la punta
        const glow = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.glowR);
        glow.addColorStop(0, `rgba(255,255,255,${d.alpha * 0.9})`);
        glow.addColorStop(0.4, `rgba(${ar},${ag},${ab},${d.alpha * 0.5})`);
        glow.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      this._raf = requestAnimationFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    drops = Array.from({ length: 120 }, makeDrop);
    drops.forEach(d => { d.y = Math.random() * H; });
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
