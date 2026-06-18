const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Torii — arco torii en la esquina inferior + pétalos y líneas zen. Temática sakura.
export class Torii extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent    = createAccentWatcher('#f472b6');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0;

    // pétalos HUD en bordes
    const makePetal = () => ({
      edge:   Math.floor(Math.random() * 4),
      pos:    Math.random(),
      size:   2 + Math.random() * 3,
      speed:  0.001 + Math.random() * 0.003,
      alpha:  0.3 + Math.random() * 0.4,
      phase:  Math.random() * Math.PI * 2,
      rot:    Math.random() * Math.PI * 2,
    });
    const petalHuds = Array.from({ length: 18 }, makePetal);

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    const drawTorii = () => {
      const [r, g, b] = this.accent.rgb ?? [244, 114, 182];
      const bx = 50;   // centro x
      const by = H - 20; // base y
      const tw = 70;   // ancho total
      const th = 90;   // altura total
      const pw = 8;    // grosor de pilares
      const alpha = 0.5 + Math.sin(t * 0.02) * 0.1;

      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fillStyle   = `rgba(${r},${g},${b},${alpha * 0.15})`;
      ctx.lineWidth   = 2;
      ctx.shadowBlur  = 14;
      ctx.shadowColor = `rgba(${r},${g},${b},0.6)`;

      // pilares
      ctx.fillRect(bx - tw/2, by - th, pw, th);
      ctx.fillRect(bx + tw/2 - pw, by - th, pw, th);
      ctx.strokeRect(bx - tw/2, by - th, pw, th);
      ctx.strokeRect(bx + tw/2 - pw, by - th, pw, th);

      // viga superior (kasagi) — curva hacia arriba en los extremos
      ctx.beginPath();
      ctx.moveTo(bx - tw/2 - 10, by - th + 14);
      ctx.bezierCurveTo(bx - tw/2, by - th + 4, bx + tw/2, by - th + 4, bx + tw/2 + 10, by - th + 14);
      ctx.lineWidth = 6;
      ctx.stroke();

      // viga secundaria (nuki)
      ctx.beginPath();
      ctx.moveTo(bx - tw/2 + pw, by - th * 0.6);
      ctx.lineTo(bx + tw/2 - pw, by - th * 0.6);
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.shadowBlur = 0;

      // línea zen horizontal fina en la base
      ctx.beginPath();
      ctx.moveTo(0, H - 8);
      ctx.lineTo(W, H - 8);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      // línea vertical en borde izquierdo
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(8, H);
      ctx.stroke();
    };

    const drawPetalHud = (p) => {
      const [r, g, b] = this.accent.rgb ?? [244, 114, 182];
      let px, py;
      const offset = 12 + Math.sin(t * 0.03 + p.phase) * 4;
      if (p.edge === 0) { px = p.pos * W; py = offset; }
      else if (p.edge === 1) { px = W - offset; py = p.pos * H; }
      else if (p.edge === 2) { px = p.pos * W; py = H - offset; }
      else { px = offset; py = p.pos * H; }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.rot + t * 0.01);
      ctx.globalAlpha = p.alpha;

      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.bezierCurveTo( p.size * 0.8, -p.size * 0.5,  p.size * 0.9,  p.size * 0.5,  0,  p.size);
      ctx.bezierCurveTo(-p.size * 0.9,  p.size * 0.5, -p.size * 0.8, -p.size * 0.5,  0, -p.size);
      ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
      ctx.fill();
      ctx.restore();

      p.pos += p.speed;
      if (p.pos > 1) p.pos = 0;
    };

    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t++;
      ctx.clearRect(0, 0, W, H);

      drawTorii();
      for (const p of petalHuds) drawPetalHud(p);
    };

    resize();
    draw();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);
    this._stop = () => { cancelAnimationFrame(raf); this._ro.disconnect(); };
  }

  componentWillUnmount() { this._stop?.(); this.accent.stop(); }

  render() {
    return html`<canvas ref=${this.canvasRef} style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10;" />`;
  }
}
