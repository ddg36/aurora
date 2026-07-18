const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

// Lava — ríos de lava fluyendo con burbujas, grietas luminosas y calor radiante.
export class Lava extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#f97316');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0, bubbles, cracks, glowSpots;

    const makeBubble = () => ({
      x:     Math.random() * (W || window.innerWidth),
      y:     (H || window.innerHeight) * (0.45 + Math.random() * 0.55),
      r:     2 + Math.random() * 11,
      speed: 0.25 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      life:  0.5 + Math.random() * 0.5,
      decay: 0.003 + Math.random() * 0.005,
    });

    const makeCrack = () => {
      const x = Math.random() * (W || window.innerWidth);
      const y = (H || window.innerHeight) * (0.35 + Math.random() * 0.55);
      const segs = 5 + Math.floor(Math.random() * 6);
      const pts  = [{ x, y }];
      for (let i = 0; i < segs; i++) {
        pts.push({
          x: pts[pts.length-1].x + (Math.random() - 0.5) * 70,
          y: pts[pts.length-1].y + 15 + Math.random() * 45,
        });
      }
      return { pts, alpha: 0.3 + Math.random() * 0.5, width: 0.5 + Math.random() * 2 };
    };

    // puntos de brillo en el suelo — simulan bolsas de lava
    const makeGlowSpot = () => ({
      x:     Math.random() * (W || window.innerWidth),
      y:     (H || window.innerHeight) * (0.5 + Math.random() * 0.5),
      r:     20 + Math.random() * 50,
      phase: Math.random() * Math.PI * 2,
      speed: 0.01 + Math.random() * 0.015,
    });

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
    };

    const init = () => {
      resize();
      const liviano = esDispositivoLiviano();
      bubbles   = Array.from({ length: liviano ? 10 : 30 }, makeBubble);
      cracks    = Array.from({ length: liviano ? 5 : 10 }, makeCrack);
      glowSpots = Array.from({ length: 6 },  makeGlowSpot);
    };

    let raf;
    const draw = () => {
      raf = sceneFrame(draw);
      t++;
      const [r, g, cb] = this.accent.rgb ?? [249, 115, 22];

      // fondo — roca oscura con tono accent
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0,    `rgb(${Math.max(2,Math.round(r*0.016))},${Math.max(0,Math.round(g*0.003))},${Math.max(0,Math.round(cb*0.003))})`);
      bg.addColorStop(0.45, `rgb(${Math.max(5,Math.round(r*0.028))},${Math.max(0,Math.round(g*0.007))},${Math.max(0,Math.round(cb*0.005))})`);
      bg.addColorStop(1,    `rgb(${Math.max(10,Math.round(r*0.055))},${Math.max(1,Math.round(g*0.013))},${Math.max(0,Math.round(cb*0.007))})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // bolsas de brillo en el suelo
      for (const gs of glowSpots) {
        const pulse = 0.5 + Math.sin(t * gs.speed + gs.phase) * 0.3;
        const glowG = ctx.createRadialGradient(gs.x, gs.y, 0, gs.x, gs.y, gs.r);
        glowG.addColorStop(0,   `rgba(${r},${Math.round(g*0.5)},${Math.round(cb*0.1)},${pulse * 0.15})`);
        glowG.addColorStop(1,   'transparent');
        ctx.fillStyle = glowG;
        ctx.beginPath(); ctx.arc(gs.x, gs.y, gs.r, 0, Math.PI * 2); ctx.fill();
      }

      // ríos de lava — franjas ondulantes
      for (let i = 0; i < 6; i++) {
        const baseY  = H * (0.28 + i * 0.13) + Math.sin(t * 0.003 + i * 1.1) * 20;
        const rh     = 10 + Math.sin(t * 0.005 + i) * 5;
        const bright = 0.16 + Math.sin(t * 0.007 + i) * 0.055;
        const lgrad  = ctx.createLinearGradient(0, baseY - rh, 0, baseY + rh);
        lgrad.addColorStop(0,   'transparent');
        lgrad.addColorStop(0.3, `rgba(${r},${Math.round(g*0.4)},${Math.round(cb*0.08)},${bright * 0.55})`);
        lgrad.addColorStop(0.5, `rgba(${Math.min(r+50,255)},${Math.round(g*0.55)},${Math.round(cb*0.12)},${bright})`);
        lgrad.addColorStop(0.7, `rgba(${r},${Math.round(g*0.4)},${Math.round(cb*0.08)},${bright * 0.55})`);
        lgrad.addColorStop(1,   'transparent');

        ctx.beginPath();
        ctx.moveTo(0, baseY - rh);
        for (let x = 0; x <= W; x += 10) {
          const wave = Math.sin(x * 0.007 + t * 0.006 + i) * rh * 0.65;
          ctx.lineTo(x, baseY + wave);
        }
        ctx.lineTo(W, baseY + rh);
        ctx.lineTo(0, baseY + rh);
        ctx.closePath();
        ctx.fillStyle = lgrad;
        ctx.fill();
      }

      // grietas luminosas
      for (const c of cracks) {
        ctx.beginPath();
        ctx.moveTo(c.pts[0].x, c.pts[0].y);
        for (let i = 1; i < c.pts.length; i++) ctx.lineTo(c.pts[i].x, c.pts[i].y);
        const pulse = c.alpha * (0.6 + Math.sin(t * 0.04) * 0.3);
        // halo exterior
        ctx.strokeStyle = `rgba(${r},${Math.round(g*0.5)},${Math.round(cb*0.12)},${pulse * 0.4})`;
        ctx.lineWidth   = c.width + 4;
        ctx.shadowBlur  = 12;
        ctx.shadowColor = `rgba(${r},${Math.round(g*0.4)},${Math.round(cb*0.1)},0.6)`;
        ctx.stroke();
        // núcleo brillante
        ctx.strokeStyle = `rgba(${Math.min(r+70,255)},${Math.round(g*0.75)},${Math.round(cb*0.18)},${pulse})`;
        ctx.lineWidth   = c.width;
        ctx.shadowBlur  = 6;
        ctx.stroke();
        ctx.shadowBlur  = 0;
      }

      // burbujas
      for (const bbl of bubbles) {
        bbl.y    -= bbl.speed;
        bbl.life -= bbl.decay;
        if (bbl.life <= 0 || bbl.y < H * 0.25) Object.assign(bbl, makeBubble());

        const pulse = bbl.life * (0.5 + Math.sin(t * 0.1 + bbl.phase) * 0.3);
        ctx.beginPath();
        ctx.arc(bbl.x, bbl.y, bbl.r, 0, Math.PI * 2);
        const bgrad = ctx.createRadialGradient(
          bbl.x - bbl.r*0.3, bbl.y - bbl.r*0.3, 0,
          bbl.x, bbl.y, bbl.r
        );
        bgrad.addColorStop(0, `rgba(${Math.min(r+90,255)},${Math.min(g+70,255)},${Math.round(cb*0.25)},${pulse * 0.9})`);
        bgrad.addColorStop(1, `rgba(${r},${Math.round(g*0.35)},${Math.round(cb*0.08)},${pulse * 0.45})`);
        ctx.fillStyle   = bgrad;
        ctx.shadowBlur  = 14;
        ctx.shadowColor = `rgba(${r},${Math.round(g*0.5)},${Math.round(cb*0.1)},${pulse})`;
        ctx.fill();
        ctx.shadowBlur  = 0;
      }

      // calor radiante arriba
      const heat = ctx.createLinearGradient(0, H * 0.3, 0, 0);
      heat.addColorStop(0,   `rgba(${r},${Math.round(g*0.25)},${Math.round(cb*0.08)},0.05)`);
      heat.addColorStop(1,   'transparent');
      ctx.fillStyle = heat;
      ctx.fillRect(0, 0, W, H * 0.3);
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
