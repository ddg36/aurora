const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Ash — cenizas cayendo lentamente. Ambiente gótico oscuro.
export class Ash extends Component {
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
    let W, H, particles;

    const makeParticle = () => ({
      x:      Math.random() * (W || window.innerWidth),
      y:      Math.random() * (H || window.innerHeight) * -1,
      size:   0.5 + Math.random() * 2.5,
      speedY: 0.3 + Math.random() * 0.7,
      speedX: (Math.random() - 0.5) * 0.4,
      drift:  (Math.random() - 0.5) * 0.02,
      alpha:  0.2 + Math.random() * 0.6,
      rot:    Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.03,
    });

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const draw = () => {
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [139, 92, 246];
      ctx.fillStyle = `rgba(${Math.round(ar*0.015)},${Math.round(ag*0.008)},${Math.round(ab*0.03)},0.35)`;
      ctx.fillRect(0, 0, W, H);

      for (const p of particles) {
        p.y       += p.speedY;
        p.x       += p.speedX;
        p.speedX  += p.drift;
        p.rot     += p.rotSpeed;

        if (p.y > H + 10) { Object.assign(p, makeParticle(), { y: -10, x: Math.random() * W }); }
        if (p.x < -10)    p.x = W + 10;
        if (p.x > W + 10) p.x = -10;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.alpha;

        // forma irregular de ceniza
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.6, p.rot, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${ar},${ag},${ab})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(255,ar+80)},${Math.min(255,ag+60)},${Math.min(255,ab+80)},0.4)`;
        ctx.fill();

        ctx.restore();
      }

      this._raf = requestAnimationFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    particles = Array.from({ length: 200 }, makeParticle);
    // Distribuir partículas en toda la pantalla al inicio
    particles.forEach(p => { p.y = Math.random() * H; });
    draw();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#030108;will-change:transform"/>`;
  }
}
