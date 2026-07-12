const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano } from '../lib.js';

// Blizzard — tormenta de nieve con cristales de hielo y viento ártico.
export class Blizzard extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#67e8f9');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, flakes, crystals, t = 0;

    const makeFlake = (full) => ({
      x:      Math.random() * (W || window.innerWidth),
      y:      full ? Math.random() * (H || window.innerHeight) : -10,
      r:      0.5 + Math.random() * 2.5,
      speedY: 1.0 + Math.random() * 2.5,
      speedX: 0.5 + Math.random() * 1.5,
      phase:  Math.random() * Math.PI * 2,
      alpha:  0.3 + Math.random() * 0.6,
      wobble: (Math.random() - 0.5) * 0.06,
    });

    const makeCrystal = () => ({
      x:      Math.random() * (W || window.innerWidth),
      y:      -30 - Math.random() * 100,
      size:   4 + Math.random() * 8,
      rot:    Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 0.02,
      speedY: 0.4 + Math.random() * 0.8,
      speedX: 0.3 + Math.random() * 0.8,
      alpha:  0.2 + Math.random() * 0.4,
      phase:  Math.random() * Math.PI * 2,
    });

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    const init = () => {
      resize();
      const liviano = esDispositivoLiviano();
      flakes   = Array.from({ length: liviano ? 45 : 180 }, () => makeFlake(true));
      crystals = Array.from({ length: liviano ? 6 : 20 }, makeCrystal);
    };

    const drawCrystal = (c) => {
      const [r, g, b] = this.accent.rgb ?? [103, 232, 249];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = c.alpha;
      ctx.strokeStyle = `rgba(${r},${g},${b},0.8)`;
      ctx.lineWidth = 0.8;

      // 6 brazos del cristal
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -c.size);
        // ramitas laterales
        ctx.moveTo(0, -c.size * 0.35);
        ctx.lineTo(c.size * 0.25, -c.size * 0.6);
        ctx.moveTo(0, -c.size * 0.35);
        ctx.lineTo(-c.size * 0.25, -c.size * 0.6);
        ctx.moveTo(0, -c.size * 0.65);
        ctx.lineTo(c.size * 0.15, -c.size * 0.82);
        ctx.moveTo(0, -c.size * 0.65);
        ctx.lineTo(-c.size * 0.15, -c.size * 0.82);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    };

    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t++;

      const [r, g, b] = this.accent.rgb ?? [103, 232, 249];

      // fondo ártico oscuro
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0,   `rgb(${Math.max(1,Math.round(r*0.008))},${Math.max(2,Math.round(g*0.025))},${Math.max(5,Math.round(b*0.06))})`);
      bg.addColorStop(0.5, `rgb(${Math.max(1,Math.round(r*0.012))},${Math.max(3,Math.round(g*0.04))},${Math.max(8,Math.round(b*0.09))})`);
      bg.addColorStop(1,   `rgb(${Math.max(1,Math.round(r*0.008))},${Math.max(2,Math.round(g*0.02))},${Math.max(4,Math.round(b*0.05))})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // aurora boreal tenue
      for (let i = 0; i < 3; i++) {
        const ay = H * 0.15 + i * 30 + Math.sin(t * 0.005 + i) * 20;
        const aw = W * (0.4 + Math.sin(t * 0.003 + i) * 0.2);
        const ax = W * 0.1 + i * W * 0.2 + Math.sin(t * 0.004 + i) * 30;
        const ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, aw);
        ag.addColorStop(0, `rgba(${r},${g},${b},0.04)`);
        ag.addColorStop(1, 'transparent');
        ctx.fillStyle = ag;
        ctx.fillRect(0, 0, W, H * 0.5);
      }

      // nieve
      for (const f of flakes) {
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${f.alpha})`;
        ctx.shadowBlur = 3;
        ctx.shadowColor = `rgba(${r},${g},${b},0.5)`;
        ctx.fill();
        ctx.shadowBlur = 0;

        f.y += f.speedY;
        f.x += f.speedX + Math.sin(t * 0.03 + f.phase) * 0.5;
        if (f.y > H + 10 || f.x > W + 10) {
          f.y = -10;
          f.x = Math.random() * W;
        }
      }

      // cristales
      for (const c of crystals) {
        drawCrystal(c);
        c.y += c.speedY;
        c.x += c.speedX;
        c.rot += c.rotSpeed;
        if (c.y > H + 40 || c.x > W + 40) {
          Object.assign(c, makeCrystal());
        }
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
