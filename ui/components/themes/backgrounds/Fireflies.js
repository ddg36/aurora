const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

// Puntos de luz que orbitan suavemente.
export class Fireflies extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#f59e0b');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const COUNT = esDispositivoLiviano() ? 15 : 45;
    let W, H, flies;

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
    };

    const makeFly = () => ({
      x: Math.random() * W, y: Math.random() * H,
      cx: Math.random() * W, cy: Math.random() * H,
      angle:  Math.random() * Math.PI * 2,
      orbitR: 20 + Math.random() * 80,
      speed:  (0.004 + Math.random() * 0.008) * (Math.random() > 0.5 ? 1 : -1),
      phase:  Math.random() * Math.PI * 2,
      pSpeed: 0.02 + Math.random() * 0.04,
      r:      1.5 + Math.random() * 2.5,
    });

    const draw = () => {
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [245, 158, 11];
      ctx.fillStyle = `rgb(${Math.max(1,Math.round(ar*0.014))},${Math.max(0,Math.round(ag*0.01))},${Math.max(0,Math.round(ab*0.005))})`;
      ctx.fillRect(0, 0, W, H);

      for (const f of flies) {
        f.angle += f.speed;
        f.phase += f.pSpeed;
        f.x = f.cx + Math.cos(f.angle) * f.orbitR;
        f.y = f.cy + Math.sin(f.angle) * f.orbitR;

        const pulse = 0.5 + 0.5 * Math.sin(f.phase);
        const alpha = 0.4 + pulse * 0.55;
        const radius = f.r * (0.7 + pulse * 0.6);

        const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius * 6);
        glow.addColorStop(0,   `rgba(${ar},${ag},${ab},${alpha * 0.5})`);
        glow.addColorStop(0.4, `rgba(${ar},${ag},${ab},${alpha * 0.15})`);
        glow.addColorStop(1,   `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(f.x, f.y, radius * 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }
      this._raf = sceneFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    flies = Array.from({ length: COUNT }, makeFly);
    draw();
  }

  componentWillUnmount() {
    cancelSceneFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1; will-change:transform"/>`;
  }
}
