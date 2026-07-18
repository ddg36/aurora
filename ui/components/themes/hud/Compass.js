const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

// Compass — brújula ártica con agujas animadas y marcadores cardinales. Temática glaciar.
export class Compass extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent    = createAccentWatcher('#67e8f9');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0;

    // aguja oscila suavemente como si hubiera campo magnético débil
    let needleAngle = -Math.PI / 2; // apunta norte (arriba)
    let needleTarget = needleAngle;
    let nextJitter = 0;

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
    };

    const CX = () => W - 65;
    const CY = () => 65;
    const R  = 50;

    let raf;
    const draw = () => {
      raf = sceneFrame(draw);
      t++;
      ctx.clearRect(0, 0, W, H);

      const [r, g, b] = this.accent.rgb ?? [103, 232, 249];
      const cx = CX(), cy = CY();

      // pequeño jitter magnético
      nextJitter--;
      if (nextJitter <= 0) {
        needleTarget = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
        nextJitter = 60 + Math.floor(Math.random() * 80);
      }
      needleAngle += (needleTarget - needleAngle) * 0.03;

      // fondo del círculo
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      bg.addColorStop(0, `rgba(0,12,20,0.85)`);
      bg.addColorStop(1, `rgba(0,5,10,0.6)`);
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();

      // anillo exterior con glow
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 10;
      ctx.shadowColor = `rgba(${r},${g},${b},0.8)`;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // marcas de graduación
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const isMajor = i % 9 === 0;
        const len = isMajor ? 8 : 4;
        const x1 = cx + Math.cos(a) * (R - 1);
        const y1 = cy + Math.sin(a) * (R - 1);
        const x2 = cx + Math.cos(a) * (R - 1 - len);
        const y2 = cy + Math.sin(a) * (R - 1 - len);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${isMajor ? 0.7 : 0.25})`;
        ctx.lineWidth = isMajor ? 1.5 : 0.8;
        ctx.stroke();
      }

      // puntos cardinales
      const cardinals = [
        { label: 'N', angle: -Math.PI / 2 },
        { label: 'E', angle: 0 },
        { label: 'S', angle: Math.PI / 2 },
        { label: 'O', angle: Math.PI },
      ];
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const c of cardinals) {
        const lx = cx + Math.cos(c.angle) * (R - 16);
        const ly = cy + Math.sin(c.angle) * (R - 16);
        const isNorth = c.label === 'N';
        ctx.fillStyle = isNorth
          ? `rgba(${r},${g},${b},0.95)`
          : `rgba(${r},${g},${b},0.5)`;
        ctx.shadowBlur = isNorth ? 8 : 0;
        ctx.shadowColor = `rgba(${r},${g},${b},1)`;
        ctx.fillText(c.label, lx, ly);
        ctx.shadowBlur = 0;
      }

      // aguja norte (azul/cyan)
      const drawNeedle = (angle, len, color, alpha) => {
        const tx = cx + Math.cos(angle) * len;
        const ty = cy + Math.sin(angle) * len;
        const lx = cx + Math.cos(angle + Math.PI) * (len * 0.45);
        const ly = cy + Math.sin(angle + Math.PI) * (len * 0.45);
        const wx = Math.cos(angle + Math.PI / 2) * 3;
        const wy = Math.sin(angle + Math.PI / 2) * 3;

        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(cx + wx, cy + wy);
        ctx.lineTo(lx, ly);
        ctx.lineTo(cx - wx, cy - wy);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      };

      drawNeedle(needleAngle, R - 12, `rgba(${r},${g},${b},1)`, 0.9);
      drawNeedle(needleAngle + Math.PI, R - 18, `rgba(${Math.round(r*0.7)},${Math.round(g*0.15)},${Math.round(b*0.15)},1)`, 0.7);

      // pivot central
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},1)`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(${r},${g},${b},1)`;
      ctx.fill();
      ctx.shadowBlur = 0;

      // etiqueta
      ctx.fillStyle = `rgba(${r},${g},${b},0.3)`;
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('◈ ÁRTICO', cx, cy + R + 10);

      // cristales de hielo en las esquinas
      const iceCorners = [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8]];
      for (let ci = 0; ci < 4; ci++) {
        const [icx, icy] = iceCorners[ci];
        const iceAlpha = 0.15 + Math.sin(t * 0.03 + ci) * 0.05;
        ctx.strokeStyle = `rgba(${r},${g},${b},${iceAlpha})`;
        ctx.lineWidth = 1;
        for (let arm = 0; arm < 6; arm++) {
          const a = (arm / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(icx, icy);
          ctx.lineTo(icx + Math.cos(a) * 10, icy + Math.sin(a) * 10);
          ctx.stroke();
        }
      }
    };

    resize();
    draw();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);
    this._stop = () => { cancelSceneFrame(raf); this._ro.disconnect(); };
  }

  componentWillUnmount() { this._stop?.(); this.accent.stop(); }

  render() {
    return html`<canvas ref=${this.canvasRef} style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10;" />`;
  }
}
