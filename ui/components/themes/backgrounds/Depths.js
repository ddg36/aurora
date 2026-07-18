const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

// Depths — corrientes submarinas con algas ondulantes y partículas de sedimento.
export class Depths extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#06b6d4');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0, seaweed, sediment;

    const makeWeed = () => ({
      x:       Math.random() * (W || window.innerWidth),
      segments: 6 + Math.floor(Math.random() * 5),
      height:  60 + Math.random() * 120,
      phase:   Math.random() * Math.PI * 2,
      speed:   0.012 + Math.random() * 0.01,
      width:   2 + Math.random() * 4,
      alpha:   0.4 + Math.random() * 0.4,
    });

    const makeSediment = () => ({
      x:      Math.random() * (W || window.innerWidth),
      y:      Math.random() * (H || window.innerHeight),
      r:      0.5 + Math.random() * 1.5,
      vx:     (Math.random() - 0.5) * 0.15,
      vy:     0.05 + Math.random() * 0.15,
      phase:  Math.random() * Math.PI * 2,
      alpha:  0.15 + Math.random() * 0.35,
    });

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
    };

    const init = () => {
      resize();
      const liviano = esDispositivoLiviano();
      seaweed  = Array.from({ length: liviano ? 6 : 18 }, makeWeed);
      sediment = Array.from({ length: liviano ? 20 : 80 }, makeSediment);
    };

    const drawWeed = (w, r, g, b) => {
      const baseY = H;
      const segH  = w.height / w.segments;
      ctx.beginPath();
      ctx.moveTo(w.x, baseY);
      for (let i = 1; i <= w.segments; i++) {
        const y    = baseY - i * segH;
        const sway = Math.sin(t * w.speed + w.phase + i * 0.4) * (i * 3.5);
        const cx1  = w.x + sway * 0.5;
        const cx2  = w.x + sway;
        ctx.bezierCurveTo(cx1, baseY - (i - 0.7) * segH, cx2, baseY - (i - 0.3) * segH, w.x + sway, y);
      }
      const tip = Math.sin(t * w.speed + w.phase + w.segments * 0.4) * (w.segments * 3.5);
      const grad = ctx.createLinearGradient(w.x, baseY, w.x + tip, baseY - w.height);
      grad.addColorStop(0, `rgba(${Math.round(r*0.3)},${Math.round(g*0.5)},${Math.round(b*0.4)},${w.alpha})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},${w.alpha * 0.6})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth   = w.width;
      ctx.lineCap     = 'round';
      ctx.stroke();
    };

    let raf;
    const draw = () => {
      raf = sceneFrame(draw);
      t++;

      const [r, g, b] = this.accent.rgb ?? [6, 182, 212];

      // fondo abismal
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0,   `rgb(${Math.max(0,Math.round(r*0.018))},${Math.max(1,Math.round(g*0.022))},${Math.max(3,Math.round(b*0.028))})`);
      bg.addColorStop(0.5, `rgb(${Math.max(0,Math.round(r*0.025))},${Math.max(2,Math.round(g*0.035))},${Math.max(5,Math.round(b*0.045))})`);
      bg.addColorStop(1,   `rgb(${Math.max(1,Math.round(r*0.03))},${Math.max(3,Math.round(g*0.045))},${Math.max(7,Math.round(b*0.06))})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // rayos de luz desde arriba
      for (let i = 0; i < 4; i++) {
        const lx  = W * (0.15 + i * 0.22) + Math.sin(t * 0.004 + i) * 30;
        const lw  = 30 + Math.sin(t * 0.005 + i * 1.2) * 15;
        const lg  = ctx.createLinearGradient(lx, 0, lx, H * 0.7);
        lg.addColorStop(0,   `rgba(${r},${g},${b},0.06)`);
        lg.addColorStop(0.6, `rgba(${r},${g},${b},0.02)`);
        lg.addColorStop(1,   'transparent');
        ctx.fillStyle = lg;
        ctx.beginPath();
        ctx.moveTo(lx - lw, 0);
        ctx.lineTo(lx + lw, 0);
        ctx.lineTo(lx + lw * 0.3, H * 0.7);
        ctx.lineTo(lx - lw * 0.3, H * 0.7);
        ctx.closePath();
        ctx.fill();
      }

      // sedimento flotante
      for (const s of sediment) {
        s.x += s.vx + Math.sin(t * 0.015 + s.phase) * 0.08;
        s.y += s.vy;
        if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
        if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${s.alpha})`;
        ctx.fill();
      }

      // algas
      for (const w of seaweed) {
        drawWeed(w, r, g, b);
      }

      // niebla de suelo
      const fog = ctx.createLinearGradient(0, H - 80, 0, H);
      fog.addColorStop(0, 'transparent');
      fog.addColorStop(1, `rgba(${Math.round(r*0.04)},${Math.round(g*0.06)},${Math.round(b*0.08)},0.5)`);
      ctx.fillStyle = fog;
      ctx.fillRect(0, H - 80, W, 80);
    };

    init();
    draw();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);
    this._stop = () => { cancelSceneFrame(raf); this._ro.disconnect(); };
  }

  componentWillUnmount() { this._stop?.(); this.accent.stop(); }

  render() {
    return html`<canvas ref=${this.canvasRef} style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;" />`;
  }
}
