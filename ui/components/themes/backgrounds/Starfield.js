const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Partículas estelares con explosiones suaves cada 2.5s.
export class Starfield extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#ef4444');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, stars, bursts;

    const rand = (a, b) => a + Math.random() * (b - a);

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const makeStar = () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: rand(0.4, 1.6),
      speed: rand(0.03, 0.18),
      opacity: rand(0.2, 0.9),
      drift: rand(-0.04, 0.04),
      twinkleSpeed: rand(0.005, 0.02),
      twinklePhase: Math.random() * Math.PI * 2,
    });

    const makeBurstParticle = (x, y) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(0.3, 1.8);
      return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r:  rand(0.5, 2.0),
        life: 1.0,
        decay: rand(0.004, 0.012),
        accent: this.accent.state?.hex ?? this.accent.hex,
      };
    };

    const spawnBurst = () => {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const count = Math.floor(rand(6, 18));
      for (let i = 0; i < count; i++) bursts.push(makeBurstParticle(x, y));
    };

    const draw = () => {
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [239, 68, 68];
      ctx.fillStyle = `rgb(${Math.max(1,Math.round(ar*0.01))},${Math.max(0,Math.round(ag*0.005))},${Math.max(2,Math.round(ab*0.015))})`;
      ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        s.twinklePhase += s.twinkleSpeed;
        const opacity = s.opacity * (0.5 + 0.5 * Math.sin(s.twinklePhase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(ar+120,255)},${Math.min(ag+120,255)},${Math.min(ab+120,255)},${opacity})`;
        ctx.fill();
        s.y -= s.speed;
        s.x += s.drift;
        if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; }
        if (s.x < -4) s.x = W + 4;
        if (s.x > W + 4) s.x = -4;
      }

      for (let i = bursts.length - 1; i >= 0; i--) {
        const p = bursts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life -= p.decay;
        if (p.life <= 0) { bursts.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.accent
          ? `${p.accent}${Math.floor(p.life * 200).toString(16).padStart(2,'0')}`
          : `rgba(${ar},${ag},${ab},${p.life})`;
        ctx.fill();
      }
      this._raf = requestAnimationFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    stars = Array.from({ length: 120 }, makeStar);
    bursts = [];
    this._burstInterval = setInterval(spawnBurst, 2500);
    draw();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
    clearInterval(this._burstInterval);
    window.removeEventListener('resize', this._resize);
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1; will-change:transform"/>`;
  }
}
