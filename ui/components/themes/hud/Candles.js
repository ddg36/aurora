const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

// Candles — velas góticas en las 4 esquinas con llama animada y cera goteando.
export class Candles extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent    = createAccentWatcher('#dc2626');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0;

    const PAD = 20;
    const CANDLE_W = 10;
    const CANDLE_H = 55;

    const candles = [
      { ax: 0, ay: 0 },
      { ax: 1, ay: 0 },
      { ax: 0, ay: 1 },
      { ax: 1, ay: 1 },
    ].map((c, i) => ({
      ...c,
      phase:    (i / 4) * Math.PI * 2,
      waxDrops: [],
      waxTimer: Math.random() * 60,
    }));

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
    };

    const drawCandle = (c, ar, ag, ab) => {
      const x  = c.ax === 0 ? PAD : W - PAD - CANDLE_W;
      const y  = c.ay === 0 ? PAD : H - PAD - CANDLE_H;
      const cx = x + CANDLE_W / 2;
      const ty = y; // top de la vela

      // cuerpo de la vela
      const bodyGrad = ctx.createLinearGradient(x, 0, x + CANDLE_W, 0);
      bodyGrad.addColorStop(0,   'rgba(220,200,180,0.9)');
      bodyGrad.addColorStop(0.4, 'rgba(255,245,230,0.95)');
      bodyGrad.addColorStop(1,   'rgba(180,160,140,0.8)');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(x, ty, CANDLE_W, CANDLE_H, 2);
      ctx.fill();

      // gotas de cera
      c.waxTimer--;
      if (c.waxTimer <= 0 && c.waxDrops.length < 5) {
        c.waxDrops.push({ x: cx + (Math.random()-0.5)*4, y: ty, len: 0, maxLen: 8+Math.random()*20, speed: 0.3+Math.random()*0.3 });
        c.waxTimer = 40 + Math.random() * 80;
      }
      for (const d of c.waxDrops) {
        d.len = Math.min(d.len + d.speed, d.maxLen);
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x, d.y + d.len);
        ctx.strokeStyle = 'rgba(255,240,215,0.8)';
        ctx.lineWidth   = 3;
        ctx.lineCap     = 'round';
        ctx.stroke();
        // gota al final
        ctx.beginPath();
        ctx.arc(d.x, d.y + d.len, 2.5, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,235,200,0.85)';
        ctx.fill();
      }

      // mecha
      const flicker = Math.sin(t * 0.18 + c.phase) * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, ty);
      ctx.lineTo(cx + flicker * 0.3, ty - 6);
      ctx.strokeStyle = 'rgba(40,20,10,0.9)';
      ctx.lineWidth   = 1;
      ctx.stroke();

      // llama
      const fh   = 14 + 4 * Math.sin(t * 0.12 + c.phase);
      const fw   = 5  + 2 * Math.sin(t * 0.09 + c.phase + 1);
      const fx   = cx + flicker * 0.5;
      const fy   = ty - 6;

      // glow exterior
      const glowR = 28 + 8 * Math.sin(t * 0.07 + c.phase);
      const glow  = ctx.createRadialGradient(fx, fy - fh * 0.3, 0, fx, fy, glowR);
      glow.addColorStop(0,   `rgba(${ar},${ag},${ab},0.35)`);
      glow.addColorStop(0.4, `rgba(${Math.min(ar+60,255)},${Math.round(ag*0.5+60)},${Math.round(ab*0.15+15)},0.15)`);
      glow.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fx, fy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // llama exterior (naranja)
      const flameOut = ctx.createRadialGradient(fx, fy, 0, fx, fy - fh * 0.4, fh * 0.8);
      flameOut.addColorStop(0,   'rgba(255,200,60,0.95)');
      flameOut.addColorStop(0.4, 'rgba(255,80,10,0.8)');
      flameOut.addColorStop(1,   'rgba(200,20,0,0)');
      ctx.fillStyle = flameOut;
      ctx.beginPath();
      ctx.moveTo(fx - fw, fy);
      ctx.bezierCurveTo(fx - fw * 1.2, fy - fh * 0.5, fx - fw * 0.3, fy - fh, fx, fy - fh);
      ctx.bezierCurveTo(fx + fw * 0.3, fy - fh, fx + fw * 1.2, fy - fh * 0.5, fx + fw, fy);
      ctx.closePath();
      ctx.fill();

      // núcleo brillante (blanco-amarillo)
      const flameIn = ctx.createRadialGradient(fx, fy - fh * 0.2, 0, fx, fy - fh * 0.2, fw * 0.8);
      flameIn.addColorStop(0, 'rgba(255,255,200,1)');
      flameIn.addColorStop(1, 'rgba(255,200,50,0)');
      ctx.fillStyle = flameIn;
      ctx.beginPath();
      ctx.ellipse(fx, fy - fh * 0.25, fw * 0.5, fh * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // iluminación en la pared/esquina
      const wallGlow = ctx.createRadialGradient(fx, fy, 0, fx, fy, 80);
      wallGlow.addColorStop(0,   `rgba(${ar},${ag},${ab},0.06)`);
      wallGlow.addColorStop(0.5, `rgba(${Math.min(ar+60,255)},${Math.round(ag*0.4+40)},${Math.round(ab*0.1)},0.03)`);
      wallGlow.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = wallGlow;
      ctx.fillRect(c.ax === 0 ? 0 : W - 100, c.ay === 0 ? 0 : H - 120, 100, 120);
    };

    const draw = () => {
      t++;
      ctx.clearRect(0, 0, W, H);
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [220, 38, 38];
      for (const c of candles) drawCandle(c, ar, ag, ab);
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
