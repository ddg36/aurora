const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

export class Autumn extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#ef4444');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0, particles = [];

    // tipos: 0=hoja oval, 1=hoja lanceolada, 2=hoja lobulada, 3=arce, 4=flor
    const TYPES = 5;

    const makeParticle = (full) => ({
      x:        full ? Math.random() * (W || window.innerWidth) : -30 + (Math.random() > 0.3 ? 0 : Math.random() * (W||800)*0.2),
      y:        full ? Math.random() * (H || window.innerHeight) : Math.random() * (H || window.innerHeight),
      size:     4 + Math.random() * 11,
      rotZ:     Math.random() * Math.PI * 2,
      rotZSpd:  (Math.random() - 0.5) * 0.055,
      tiltX:    Math.random() * Math.PI * 2,
      tiltXSpd: 0.020 + Math.random() * 0.030,
      speedY:   0.25 + Math.random() * 1.0,
      speedX:   0.7  + Math.random() * 1.5,
      swingAmp: 0.5  + Math.random() * 1.2,
      swingSpd: 0.010 + Math.random() * 0.018,
      phase:    Math.random() * Math.PI * 2,
      type:     Math.floor(Math.random() * TYPES),
      hue:      Math.random(),
      alpha:    0.60 + Math.random() * 0.35,
    });

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    const init = () => {
      resize();
      particles = Array.from({ length: 70 }, () => makeParticle(true));
    };

    // paleta otoñal derivada del accent
    const leafColor = (hue, r, g, b) => {
      const idx = Math.floor(hue * 4);
      if (idx === 0) return [Math.min(r+55,220), Math.round(g*0.35+15), Math.round(b*0.08)];  // rojo
      if (idx === 1) return [Math.min(r+35,210), Math.round(g*0.55+35), Math.round(b*0.08)];  // naranja
      if (idx === 2) return [Math.min(r+25,200), Math.round(g*0.70+55), Math.round(b*0.08)];  // dorado
      return               [Math.round(r*0.65),  Math.round(g*0.28+8),  Math.round(b*0.04)];  // marrón
    };

    const drawShape = (p, r, g, b) => {
      const s = p.size;
      const scaleX   = Math.cos(p.tiltX);
      const absScale = Math.abs(scaleX);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotZ);
      ctx.scale(scaleX, 1);

      if (p.type === 4) {
        // ── Flor de 5 pétalos ────────────────────────────────────────────────
        const pr = Math.min(r+80, 255), pg = Math.min(g+60, 255), pb = Math.min(b+80, 255);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const px = Math.cos(a) * s * 0.55;
          const py = Math.sin(a) * s * 0.55;
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(a);
          const pg2 = ctx.createRadialGradient(0, -s*0.2, 0, 0, 0, s*0.7);
          pg2.addColorStop(0,   `rgba(${Math.min(pr+40,255)},${Math.min(pg+30,255)},${Math.min(pb+30,255)},${p.alpha})`);
          pg2.addColorStop(1,   `rgba(${pr},${pg},${pb},${p.alpha*0.5})`);
          ctx.beginPath();
          ctx.ellipse(0, 0, s*0.32, s*0.52, 0, 0, Math.PI*2);
          ctx.fillStyle = pg2;
          ctx.fill();
          ctx.restore();
        }
        // centro
        ctx.beginPath();
        ctx.arc(0, 0, s*0.22, 0, Math.PI*2);
        const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, s*0.22);
        cg.addColorStop(0, `rgba(${Math.min(r+150,255)},${Math.min(g+130,255)},${Math.round(b*0.3+40)},${p.alpha})`);
        cg.addColorStop(1, `rgba(${Math.min(r+80,255)},${Math.min(g+60,255)},${Math.round(b*0.2)},${p.alpha*0.8})`);
        ctx.fillStyle = cg;
        ctx.fill();

      } else {
        // ── Hojas ────────────────────────────────────────────────────────────
        const [lr, lg, lb] = leafColor(p.hue, r, g, b);
        const bright = Math.round(20 + absScale * 30);
        const grad = ctx.createRadialGradient(0, -s*0.2, 0, 0, 0, s*1.1);
        grad.addColorStop(0,   `rgba(${Math.min(lr+bright,255)},${Math.min(lg+bright,255)},${Math.min(lb+bright,255)},${p.alpha})`);
        grad.addColorStop(0.6, `rgba(${lr},${lg},${lb},${p.alpha})`);
        grad.addColorStop(1,   `rgba(${Math.max(lr-25,0)},${Math.max(lg-20,0)},${Math.max(lb-10,0)},${p.alpha*0.5})`);
        ctx.fillStyle = grad;

        if (p.type === 0) {
          // oval simple
          ctx.beginPath();
          ctx.moveTo(0,-s);
          ctx.bezierCurveTo(s*0.55,-s*0.5, s*0.55,s*0.5, 0,s);
          ctx.bezierCurveTo(-s*0.55,s*0.5,-s*0.55,-s*0.5, 0,-s);
          ctx.closePath();
          ctx.fill();
          if (absScale > 0.3) { ctx.beginPath(); ctx.moveTo(0,-s*0.85); ctx.lineTo(0,s*0.85); ctx.strokeStyle=`rgba(${Math.max(lr-40,0)},${Math.max(lg-30,0)},${Math.max(lb-15,0)},${p.alpha*0.35})`; ctx.lineWidth=0.5; ctx.stroke(); }

        } else if (p.type === 1) {
          // lanceolada alargada
          ctx.beginPath();
          ctx.moveTo(0,-s*1.15);
          ctx.bezierCurveTo(s*0.35,-s*0.5, s*0.35,s*0.5, 0,s*1.15);
          ctx.bezierCurveTo(-s*0.35,s*0.5,-s*0.35,-s*0.5, 0,-s*1.15);
          ctx.closePath();
          ctx.fill();
          // venas laterales
          if (absScale > 0.3) {
            ctx.strokeStyle = `rgba(${Math.max(lr-40,0)},${Math.max(lg-30,0)},${Math.max(lb-15,0)},${p.alpha*0.3})`;
            ctx.lineWidth = 0.5;
            [-0.5,0,0.5].forEach(oy => { ctx.beginPath(); ctx.moveTo(0,oy*s); ctx.lineTo(s*0.28,oy*s+s*0.18); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,oy*s); ctx.lineTo(-s*0.28,oy*s+s*0.18); ctx.stroke(); });
          }

        } else if (p.type === 2) {
          // lobulada (roble) — bordes ondulados
          ctx.beginPath();
          const lobes = 7;
          for (let i = 0; i <= lobes; i++) {
            const frac = i / lobes;
            const y = -s + frac * s * 2;
            const bulge = s * 0.48 * Math.sin(frac * Math.PI);
            const wave  = s * 0.18 * Math.sin(frac * Math.PI * lobes);
            if (i === 0) ctx.moveTo(0, y);
            else ctx.bezierCurveTo(bulge + wave, y - s*0.18, bulge + wave, y, bulge, y);
          }
          for (let i = lobes; i >= 0; i--) {
            const frac = i / lobes;
            const y = -s + frac * s * 2;
            const bulge = -s * 0.48 * Math.sin(frac * Math.PI);
            const wave  = -s * 0.18 * Math.sin(frac * Math.PI * lobes);
            ctx.bezierCurveTo(bulge + wave, y, bulge + wave, y + s*0.18, bulge, y);
          }
          ctx.closePath();
          ctx.fill();
          if (absScale > 0.3) { ctx.beginPath(); ctx.moveTo(0,-s*0.9); ctx.lineTo(0,s*0.9); ctx.strokeStyle=`rgba(${Math.max(lr-40,0)},${Math.max(lg-30,0)},${Math.max(lb-15,0)},${p.alpha*0.3})`; ctx.lineWidth=0.5; ctx.stroke(); }

        } else {
          // arce — 5 lóbulos puntiagudos
          ctx.beginPath();
          const maplePoints = [
            [0,-1], [0.18,-0.48], [0.62,-0.62], [0.38,-0.12],
            [0.95,0.12], [0.48,0.12], [0.28,0.58], [0,-0.28],
            [-0.28,0.58], [-0.48,0.12], [-0.95,0.12], [-0.38,-0.12],
            [-0.62,-0.62], [-0.18,-0.48],
          ];
          ctx.moveTo(maplePoints[0][0]*s, maplePoints[0][1]*s);
          for (let i = 1; i < maplePoints.length; i++)
            ctx.lineTo(maplePoints[i][0]*s, maplePoints[i][1]*s);
          ctx.closePath();
          ctx.fill();
          // venas
          if (absScale > 0.3) {
            ctx.strokeStyle = `rgba(${Math.max(lr-45,0)},${Math.max(lg-35,0)},${Math.max(lb-15,0)},${p.alpha*0.35})`;
            ctx.lineWidth = 0.5;
            const veins = [[0,-s],[0,s*0.28],[0,-s*0.28],[s*0.38,-s*0.12],[0,-s*0.28],[-s*0.38,-s*0.12],[0,s*0.08],[s*0.48,s*0.12],[0,s*0.08],[-s*0.48,s*0.12]];
            for (let i = 0; i < veins.length; i+=2) { ctx.beginPath(); ctx.moveTo(veins[i][0],veins[i][1]); ctx.lineTo(veins[i+1][0],veins[i+1][1]); ctx.stroke(); }
          }
        }
      }

      ctx.restore();
    };

    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t++;
      const [r, g, b] = this.accent.rgb ?? [220, 80, 20];

      // fondo oscuro con tinte accent
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0,   `rgb(${Math.max(4,Math.round(r*0.025))},${Math.max(2,Math.round(g*0.012))},${Math.max(3,Math.round(b*0.018))})`);
      bg.addColorStop(0.5, `rgb(${Math.max(7,Math.round(r*0.038))},${Math.max(3,Math.round(g*0.016))},${Math.max(5,Math.round(b*0.025))})`);
      bg.addColorStop(1,   `rgb(${Math.max(3,Math.round(r*0.02))},${Math.max(1,Math.round(g*0.009))},${Math.max(2,Math.round(b*0.014))})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      for (const p of particles) {
        drawShape(p, r, g, b);
        const windX = 1.1 + Math.sin(t * 0.006 + p.phase) * 0.35;
        p.x     += p.speedX * windX * 0.62 + Math.sin(t * p.swingSpd + p.phase) * p.swingAmp;
        p.y     += p.speedY;
        p.rotZ  += p.rotZSpd + windX * 0.005;
        p.tiltX += p.tiltXSpd;
        if (p.x > W + 40 || p.y > H + 20) Object.assign(p, makeParticle(false));
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
