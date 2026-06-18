const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Ember — brasas y runas ardientes en los bordes. Temática infernal.
export class Ember extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent    = createAccentWatcher('#f97316');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0;

    const FIRE_RUNES = ['ᚠ','ᚢ','ᚦ','ᛉ','ᛊ','᛭','ᚷ','ᛃ'];
    const corners = [
      { ax: 0, ay: 0, ox: 1,  oy: 1  },
      { ax: 1, ay: 0, ox: -1, oy: 1  },
      { ax: 0, ay: 1, ox: 1,  oy: -1 },
      { ax: 1, ay: 1, ox: -1, oy: -1 },
    ];
    const runeData = corners.map((c, i) => ({
      ...c,
      main: FIRE_RUNES[i % FIRE_RUNES.length],
      phase: i * Math.PI * 0.5,
      charTimer: 0,
      interval: 80 + i * 20,
    }));

    // brasas flotantes en los bordes
    const makeEdgeEmber = () => ({
      edge:   Math.floor(Math.random() * 4), // 0=top,1=right,2=bottom,3=left
      pos:    Math.random(),
      r:      1 + Math.random() * 2,
      speed:  0.003 + Math.random() * 0.005,
      alpha:  0.4 + Math.random() * 0.5,
      phase:  Math.random() * Math.PI * 2,
      offset: 8 + Math.random() * 12,
    });
    const edgeEmbers = Array.from({ length: 30 }, makeEdgeEmber);

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t++;
      ctx.clearRect(0, 0, W, H);

      const [r, g, b] = this.accent.rgb ?? [249, 115, 22];

      // borde ardiente — línea fina con glow
      const borderAlpha = 0.25 + Math.sin(t * 0.04) * 0.08;
      ctx.strokeStyle = `rgba(${r},${Math.round(g*0.5)},0,${borderAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 12;
      ctx.shadowColor = `rgba(${r},80,0,0.6)`;
      ctx.strokeRect(3, 3, W - 6, H - 6);
      ctx.shadowBlur = 0;

      // runas en esquinas
      for (const rd of runeData) {
        rd.charTimer++;
        if (rd.charTimer >= rd.interval) {
          rd.main = FIRE_RUNES[Math.floor(Math.random() * FIRE_RUNES.length)];
          rd.charTimer = 0;
        }

        const px = rd.ax * W + rd.ox * 28;
        const py = rd.ay * H + rd.oy * 28;
        const pulse = 0.55 + Math.sin(t * 0.06 + rd.phase) * 0.3;

        ctx.font = 'bold 38px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowBlur = 20 + Math.sin(t * 0.06 + rd.phase) * 10;
        ctx.shadowColor = `rgba(${r},${Math.round(g*0.35)},0,${pulse})`;
        ctx.fillStyle = `rgba(${r},${Math.round(g*0.4)},0,${pulse})`;
        ctx.fillText(rd.main, px, py);

        // runa secundaria más pequeña
        const px2 = rd.ax * W + rd.ox * 52;
        const py2 = rd.ay * H + rd.oy * 20;
        ctx.font = '18px serif';
        ctx.fillStyle = `rgba(${r},${Math.round(g*0.3)},0,${pulse * 0.6})`;
        ctx.shadowBlur = 10;
        ctx.fillText(FIRE_RUNES[(FIRE_RUNES.indexOf(rd.main) + 2) % FIRE_RUNES.length], px2, py2);
        ctx.shadowBlur = 0;
      }

      // brasas en bordes
      for (const e of edgeEmbers) {
        let ex, ey;
        const flicker = Math.sin(t * 0.08 + e.phase) * 4;
        if (e.edge === 0) { ex = e.pos * W; ey = e.offset + flicker; }
        else if (e.edge === 1) { ex = W - e.offset - flicker; ey = e.pos * H; }
        else if (e.edge === 2) { ex = e.pos * W; ey = H - e.offset - flicker; }
        else { ex = e.offset + flicker; ey = e.pos * H; }

        const heat = e.alpha * (0.6 + Math.sin(t * 0.1 + e.phase) * 0.3);
        ctx.beginPath();
        ctx.arc(ex, ey, e.r, 0, Math.PI * 2);
        ctx.fillStyle = t % 40 < 20
          ? `rgba(${Math.min(r+60,255)},${Math.min(g+130,255)},${Math.min(b*0.25+30,80)},${heat})`
          : `rgba(${r},${Math.round(g*0.3)},0,${heat})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `rgba(${r},${Math.round(g*0.35)},0,${heat})`;
        ctx.fill();
        ctx.shadowBlur = 0;

        e.pos += e.speed;
        if (e.pos > 1) e.pos = 0;
      }
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
