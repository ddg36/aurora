const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

// Abyss — océano profundo con bioluminiscencia, partículas flotantes y pulsos de medusa.
export class Abyss extends Component {
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
    let W, H, particles, jellyfish, t = 0;

    const makeParticle = () => ({
      x:      Math.random() * (W || window.innerWidth),
      y:      Math.random() * (H || window.innerHeight),
      r:      0.5 + Math.random() * 2,
      speedY: -(0.1 + Math.random() * 0.4),
      speedX: (Math.random() - 0.5) * 0.15,
      phase:  Math.random() * Math.PI * 2,
      alpha:  0.3 + Math.random() * 0.6,
    });

    const makeJelly = () => ({
      x:     Math.random() * (W || window.innerWidth),
      y:     (H || window.innerHeight) + 80 + Math.random() * 200,
      r:     18 + Math.random() * 28,
      speedY: -(0.2 + Math.random() * 0.3),
      phase:  Math.random() * Math.PI * 2,
      pulse:  0,
      tentacles: Math.floor(5 + Math.random() * 5),
    });

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
    };

    const init = () => {
      resize();
      const liviano = esDispositivoLiviano();
      particles = Array.from({ length: liviano ? 30 : 120 }, makeParticle);
      jellyfish = Array.from({ length: liviano ? 2 : 5 }, makeJelly);
    };

    const drawJelly = (j) => {
      const [r, g, b] = this.accent.rgb ?? [6, 182, 212];
      j.pulse = (Math.sin(t * 0.04 + j.phase) + 1) / 2;
      const alpha = 0.12 + j.pulse * 0.18;
      const wobble = j.x + Math.sin(t * 0.02 + j.phase) * 12;

      // cuerpo (campana)
      ctx.beginPath();
      ctx.ellipse(wobble, j.y, j.r * (0.85 + j.pulse * 0.15), j.r * 0.6, 0, Math.PI, 0);
      const grad = ctx.createRadialGradient(wobble, j.y, 0, wobble, j.y, j.r);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha * 2})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.fill();

      // tentáculos
      for (let i = 0; i < j.tentacles; i++) {
        const tx = wobble + (i - j.tentacles / 2) * (j.r * 0.22);
        const len = j.r * (1.2 + Math.sin(t * 0.05 + i) * 0.4);
        ctx.beginPath();
        ctx.moveTo(tx, j.y);
        ctx.bezierCurveTo(
          tx + Math.sin(t * 0.03 + i) * 8, j.y + len * 0.4,
          tx + Math.sin(t * 0.025 + i + 1) * 6, j.y + len * 0.7,
          tx + Math.sin(t * 0.02 + i + 2) * 4, j.y + len
        );
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.7})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    };

    let raf;
    const draw = () => {
      raf = sceneFrame(draw);
      t++;

      const [r, g, b] = this.accent.rgb ?? [6, 182, 212];

      // fondo gradiente abismal
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0,   `rgb(${Math.max(1,Math.round(r*0.02))},${Math.max(1,Math.round(g*0.025))},${Math.max(3,Math.round(b*0.03))})`);
      bg.addColorStop(0.5, `rgb(${Math.max(1,Math.round(r*0.03))},${Math.max(1,Math.round(g*0.04))},${Math.max(4,Math.round(b*0.05))})`);
      bg.addColorStop(1,   `rgb(${Math.max(1,Math.round(r*0.01))},${Math.max(1,Math.round(g*0.015))},${Math.max(2,Math.round(b*0.02))})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // corriente horizontal sutil
      for (let i = 0; i < 3; i++) {
        const y = H * (0.25 + i * 0.25) + Math.sin(t * 0.008 + i) * 30;
        const grad = ctx.createLinearGradient(0, y - 40, 0, y + 40);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.5, `rgba(${r},${g},${b},0.03)`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(0, y - 40, W, 80);
      }

      // partículas bioluminiscentes
      for (const p of particles) {
        const flicker = Math.sin(t * 0.05 + p.phase) * 0.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${p.alpha + flicker})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `rgba(${r},${g},${b},0.8)`;
        ctx.fill();
        ctx.shadowBlur = 0;

        p.y += p.speedY;
        p.x += p.speedX + Math.sin(t * 0.02 + p.phase) * 0.1;
        if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
      }

      // medusas
      for (const j of jellyfish) {
        drawJelly(j);
        j.y += j.speedY;
        if (j.y < -120) { j.y = H + 100; j.x = Math.random() * W; }
      }
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
