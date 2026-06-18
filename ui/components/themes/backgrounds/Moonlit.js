const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Moonlit — noche de luna japonesa con pétalos iluminados, linterna flotante y niebla.
export class Moonlit extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#f472b6');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0, motes, lanterns;

    const makeMote = (full) => ({
      x:      Math.random() * (W || window.innerWidth),
      y:      full ? Math.random() * (H || window.innerHeight) : -10 - Math.random() * 100,
      r:      0.8 + Math.random() * 2.5,
      vx:     (Math.random() - 0.5) * 0.3,
      vy:     0.2 + Math.random() * 0.5,
      phase:  Math.random() * Math.PI * 2,
      alpha:  0.3 + Math.random() * 0.5,
      swing:  (Math.random() - 0.5) * 0.02,
    });

    const makeLantern = () => ({
      x:     Math.random() * (W || window.innerWidth),
      y:     (H || window.innerHeight) * (0.4 + Math.random() * 0.4),
      vy:   -(0.08 + Math.random() * 0.12),
      phase: Math.random() * Math.PI * 2,
      size:  8 + Math.random() * 10,
      alpha: 0.5 + Math.random() * 0.4,
    });

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    const init = () => {
      resize();
      motes    = Array.from({ length: 60 }, (_, i) => makeMote(i < 40));
      lanterns = Array.from({ length: 6 }, makeLantern);
    };

    const drawLantern = (l, r, g, b) => {
      const sway = Math.sin(t * 0.015 + l.phase) * 6;
      const lx   = l.x + sway;
      const pulse = 0.7 + Math.sin(t * 0.04 + l.phase) * 0.3;

      // glow exterior
      const glow = ctx.createRadialGradient(lx, l.y, 0, lx, l.y, l.size * 3);
      glow.addColorStop(0, `rgba(${r},${g},${b},${l.alpha * 0.25 * pulse})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lx, l.y, l.size * 3, 0, Math.PI * 2);
      ctx.fill();

      // cuerpo de la linterna
      ctx.save();
      ctx.translate(lx, l.y);
      const lg = ctx.createLinearGradient(-l.size * 0.5, -l.size, l.size * 0.5, l.size);
      lg.addColorStop(0, `rgba(${Math.min(r+80,255)},${Math.min(g+60,255)},${Math.min(b+40,255)},${l.alpha * pulse})`);
      lg.addColorStop(0.5, `rgba(${r},${g},${Math.round(b*0.5)},${l.alpha * pulse * 0.8})`);
      lg.addColorStop(1, `rgba(${Math.round(r*0.6)},${Math.round(g*0.4)},${Math.round(b*0.2)},${l.alpha * 0.4})`);
      ctx.beginPath();
      ctx.ellipse(0, 0, l.size * 0.5, l.size, 0, 0, Math.PI * 2);
      ctx.fillStyle = lg;
      ctx.fill();
      // hilos
      ctx.strokeStyle = `rgba(${r},${g},${b},${l.alpha * 0.4})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, -l.size); ctx.lineTo(0, -l.size * 1.6); ctx.stroke();
      ctx.restore();
    };

    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t++;

      const [r, g, b] = this.accent.rgb ?? [244, 114, 182];

      // fondo — noche profunda con tinte del tema
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0,   `rgb(${Math.max(2,Math.round(r*0.028))},${Math.max(0,Math.round(g*0.008))},${Math.max(4,Math.round(b*0.04))})`);
      bg.addColorStop(0.5, `rgb(${Math.max(4,Math.round(r*0.04))},${Math.max(1,Math.round(g*0.012))},${Math.max(6,Math.round(b*0.055))})`);
      bg.addColorStop(1,   `rgb(${Math.max(2,Math.round(r*0.025))},${Math.max(0,Math.round(g*0.006))},${Math.max(3,Math.round(b*0.032))})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // luna grande en la esquina
      const mx = W * 0.78, my = H * 0.14, mr = 55;
      const moonG = ctx.createRadialGradient(mx - mr*0.2, my - mr*0.2, 0, mx, my, mr);
      moonG.addColorStop(0,   `rgba(${Math.min(r+130,255)},${Math.min(g+110,255)},${Math.min(b+110,255)},0.92)`);
      moonG.addColorStop(0.6, `rgba(${Math.min(r+70,255)},${Math.min(g+60,255)},${Math.min(b+70,255)},0.55)`);
      moonG.addColorStop(1,   `rgba(${Math.round(r*0.4)},${Math.round(g*0.2)},${Math.round(b*0.4)},0)`);
      ctx.shadowColor = `rgba(${r},${g},${b},0.3)`;
      ctx.shadowBlur  = 40;
      ctx.fillStyle   = moonG;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur  = 0;

      // niebla en capas
      for (let i = 0; i < 3; i++) {
        const fy    = H * (0.35 + i * 0.22) + Math.sin(t * 0.004 + i * 2) * 20;
        const fgrad = ctx.createLinearGradient(0, fy - 50, 0, fy + 50);
        fgrad.addColorStop(0, 'transparent');
        fgrad.addColorStop(0.5, `rgba(${r},${Math.round(g*0.5)},${b},0.035)`);
        fgrad.addColorStop(1, 'transparent');
        ctx.fillStyle = fgrad;
        ctx.fillRect(0, fy - 50, W, 100);
      }

      // linternas flotantes
      for (const l of lanterns) {
        l.y += l.vy;
        l.x += Math.sin(t * 0.01 + l.phase) * 0.2;
        if (l.y < -l.size * 3) { l.y = H * 0.9; l.x = Math.random() * W; }
        drawLantern(l, r, g, b);
      }

      // motas de luz flotando
      for (const m of motes) {
        m.x += m.vx + Math.sin(t * 0.018 + m.phase) * 0.25;
        m.y += m.vy;
        m.vx += m.swing;
        if (m.y > H + 10) Object.assign(m, makeMote(false));
        if (m.x < -5) m.x = W + 5; if (m.x > W + 5) m.x = -5;

        const flicker = m.alpha * (0.6 + Math.sin(t * 0.06 + m.phase) * 0.4);
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle  = `rgba(${Math.min(r+60,255)},${Math.min(g+50,255)},${Math.min(b+50,255)},${flicker})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `rgba(${r},${g},${b},${flicker * 0.8})`;
        ctx.fill();
        ctx.shadowBlur  = 0;
      }
    };

    init();
    draw();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);
    this._stop = () => { cancelAnimationFrame(raf); this._ro.disconnect(); };
  }

  componentWillUnmount() { this._stop?.(); this.accent.stop(); }

  render() {
    return html`<canvas ref=${this.canvasRef} style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;" />`;
  }
}
