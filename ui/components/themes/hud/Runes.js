const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

// Runes — runas góticas en las 4 esquinas, grandes y con glow pulsante.
const RUNES = ['ᚠ','ᚢ','ᚦ','ᚨ','ᚱ','ᚲ','ᚷ','ᚹ','ᚾ','ᛁ','ᛇ','ᛈ','ᛉ','ᛊ','ᛏ','ᛒ','ᛖ','ᛗ','ᛚ','ᛟ','᛭','ᛜ','ᚺ','ᛃ'];

export class Runes extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent    = createAccentWatcher('#8b5cf6');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0;

    // 4 esquinas, cada una con 3 runas apiladas + 1 central grande
    const corners = [
      { ax: 0, ay: 0, ox: 1,  oy: 1  },  // TL
      { ax: 1, ay: 0, ox: -1, oy: 1  },  // TR
      { ax: 0, ay: 1, ox: 1,  oy: -1 },  // BL
      { ax: 1, ay: 1, ox: -1, oy: -1 },  // BR
    ];

    const runeData = corners.map((c, i) => ({
      ...c,
      main:  RUNES[i * 3 % RUNES.length],
      subs:  [RUNES[(i*3+1) % RUNES.length], RUNES[(i*3+2) % RUNES.length], RUNES[(i*3+4) % RUNES.length]],
      phase: (i / 4) * Math.PI * 2,
      changeTimer: 0,
    }));

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
    };

    const drawRune = (char, x, y, size, alpha, glow, color) => {
      const [ar, ag, ab] = color;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${size}px serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';

      // glow
      ctx.shadowColor = `rgba(${ar},${ag},${ab},0.9)`;
      ctx.shadowBlur  = glow;
      ctx.fillStyle   = `rgba(${ar},${ag},${ab},1)`;
      ctx.fillText(char, x, y);

      // segunda pasada más brillante en el centro
      ctx.shadowBlur  = glow * 0.4;
      ctx.fillStyle   = `rgba(255,255,255,0.7)`;
      ctx.fillText(char, x, y);

      ctx.restore();
    };

    const draw = () => {
      t++;
      ctx.clearRect(0, 0, W, H);
      const rgb = this.accent.state?.rgb ?? this.accent.rgb ?? [139, 92, 246];
      const PAD = 28;

      for (const r of runeData) {
        r.changeTimer++;
        if (r.changeTimer > 180 + Math.random() * 120) {
          r.main = RUNES[Math.floor(Math.random() * RUNES.length)];
          r.subs = r.subs.map(() => RUNES[Math.floor(Math.random() * RUNES.length)]);
          r.changeTimer = 0;
        }

        const pulse = 0.5 + 0.5 * Math.sin(t * 0.025 + r.phase);
        const cx = r.ax === 0 ? PAD + 30 : W - PAD - 30;
        const cy = r.ay === 0 ? PAD + 30 : H - PAD - 30;

        // runa principal grande
        const mainAlpha = 0.55 + 0.35 * pulse;
        const mainGlow  = 18 + 14 * pulse;
        drawRune(r.main, cx, cy, 52, mainAlpha, mainGlow, rgb);

        // línea decorativa desde la esquina
        const [ar, ag, ab] = rgb;
        ctx.save();
        ctx.globalAlpha = 0.15 + 0.1 * pulse;
        ctx.strokeStyle = `rgba(${ar},${ag},${ab},1)`;
        ctx.lineWidth   = 0.5;
        ctx.shadowColor = `rgba(${ar},${ag},${ab},0.6)`;
        ctx.shadowBlur  = 6;
        const ex = r.ax === 0 ? 0 : W;
        const ey = r.ay === 0 ? 0 : H;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(cx + r.ox * 30, cy + r.oy * 30);
        ctx.stroke();
        ctx.restore();

        // runas secundarias más pequeñas al lado
        r.subs.forEach((s, si) => {
          const subAlpha = 0.25 + 0.15 * Math.sin(t * 0.02 + r.phase + si);
          const subGlow  = 8 + 5 * pulse;
          const sx = cx + r.ox * (22 + si * 18);
          const sy = cy + r.oy * (si % 2 === 0 ? 8 : -8);
          drawRune(s, sx, sy, 18, subAlpha, subGlow, rgb);
        });
      }

      this._raf = sceneFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    draw();
  }

  componentWillUnmount() {
    cancelSceneFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:10"/>`;
  }
}
