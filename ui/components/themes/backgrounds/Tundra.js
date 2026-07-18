const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

// Tundra — campo de hielo con cristales en el suelo, ventisca y auroras polares.
export class Tundra extends Component {
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
    let W, H, t = 0, shards, snowdrift;

    const makeShard = () => ({
      x:     Math.random() * (W || window.innerWidth),
      y:     (H || window.innerHeight) * (0.65 + Math.random() * 0.35),
      h:     8 + Math.random() * 30,
      w:     2 + Math.random() * 6,
      angle: (Math.random() - 0.5) * 0.4,
      alpha: 0.3 + Math.random() * 0.5,
    });

    const makeFlake = () => ({
      x:      Math.random() * (W || window.innerWidth),
      y:      Math.random() * (H || window.innerHeight),
      r:      0.3 + Math.random() * 1.2,
      vx:     1.5 + Math.random() * 2.5,
      vy:     0.3 + Math.random() * 0.8,
      phase:  Math.random() * Math.PI * 2,
      alpha:  0.2 + Math.random() * 0.5,
    });

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
    };

    const init = () => {
      resize();
      const liviano = esDispositivoLiviano();
      shards    = Array.from({ length: liviano ? 18 : 60 }, makeShard);
      snowdrift = Array.from({ length: liviano ? 35 : 120 }, makeFlake);
    };

    let raf;
    const draw = () => {
      raf = sceneFrame(draw);
      t++;

      const [r, g, b] = this.accent.rgb ?? [103, 232, 249];

      // fondo — cielo polar oscuro
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0,   `rgb(${Math.max(0,Math.round(r*0.006))},${Math.max(1,Math.round(g*0.018))},${Math.max(4,Math.round(b*0.05))})`);
      bg.addColorStop(0.6, `rgb(${Math.max(0,Math.round(r*0.01))},${Math.max(2,Math.round(g*0.028))},${Math.max(6,Math.round(b*0.075))})`);
      bg.addColorStop(1,   `rgb(${Math.max(1,Math.round(r*0.015))},${Math.max(3,Math.round(g*0.038))},${Math.max(8,Math.round(b*0.09))})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // auroras polares — bandas ondulantes
      for (let i = 0; i < 3; i++) {
        const ay  = H * (0.12 + i * 0.12) + Math.sin(t * 0.004 + i * 2.1) * 25;
        const aw  = W * (0.5 + Math.sin(t * 0.003 + i) * 0.2);
        const ax  = W * (0.1 + i * 0.25) + Math.cos(t * 0.003 + i) * 40;
        const ah  = 40 + Math.sin(t * 0.005 + i) * 15;

        const agrad = ctx.createLinearGradient(0, ay - ah, 0, ay + ah);
        agrad.addColorStop(0,   'transparent');
        agrad.addColorStop(0.4, `rgba(${r},${g},${b},0.05)`);
        agrad.addColorStop(0.5, `rgba(${Math.round(r*0.6)},${g},${Math.min(b+20,255)},0.08)`);
        agrad.addColorStop(0.6, `rgba(${r},${g},${b},0.05)`);
        agrad.addColorStop(1,   'transparent');

        ctx.beginPath();
        ctx.moveTo(0, ay - ah);
        for (let x = 0; x <= W; x += 10) {
          const wave = Math.sin(x * 0.005 + t * 0.004 + i * 1.5) * ah * 0.7;
          ctx.lineTo(x, ay + wave);
        }
        ctx.lineTo(W, ay + ah); ctx.lineTo(0, ay + ah);
        ctx.closePath();
        ctx.fillStyle = agrad;
        ctx.fill();
      }

      // ventisca — nieve soplando horizontal
      for (const f of snowdrift) {
        f.x += f.vx;
        f.y += f.vy + Math.sin(t * 0.02 + f.phase) * 0.3;
        if (f.x > W + 10) { f.x = -10; f.y = Math.random() * H; }
        if (f.y > H + 10) { f.y = -10; }
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(r+100,255)},${Math.min(g+80,255)},${Math.min(b+60,255)},${f.alpha})`;
        ctx.fill();
      }

      // campo de hielo — cristales verticales en el suelo
      for (const s of shards) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        // cristal con gradiente
        const sg = ctx.createLinearGradient(0, 0, s.w, -s.h);
        sg.addColorStop(0, `rgba(${Math.round(r*0.4)},${Math.round(g*0.5)},${Math.round(b*0.6)},${s.alpha})`);
        sg.addColorStop(0.5, `rgba(${Math.min(r+60,255)},${Math.min(g+80,255)},${Math.min(b+50,255)},${s.alpha * 0.8})`);
        sg.addColorStop(1, `rgba(${Math.min(r+100,255)},${Math.min(g+120,255)},${Math.min(b+80,255)},${s.alpha * 0.3})`);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-s.w * 0.5, -s.h * 0.7);
        ctx.lineTo(0, -s.h);
        ctx.lineTo(s.w * 0.5, -s.h * 0.7);
        ctx.closePath();
        ctx.fillStyle = sg;
        ctx.fill();
        ctx.strokeStyle = `rgba(${Math.min(r+120,255)},${Math.min(g+140,255)},${Math.min(b+100,255)},${s.alpha * 0.5})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.restore();
      }

      // neblina de suelo helada
      const mist = ctx.createLinearGradient(0, H * 0.7, 0, H);
      mist.addColorStop(0, 'transparent');
      mist.addColorStop(1, `rgba(${Math.round(r*0.15)},${Math.round(g*0.22)},${Math.round(b*0.3)},0.35)`);
      ctx.fillStyle = mist;
      ctx.fillRect(0, H * 0.7, W, H * 0.3);
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
