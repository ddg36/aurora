const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

export class Castle extends Component {
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
    let lightning = null, lightningTimer = 0;
    let bats = [], stars = [], fogLayers = [];

    // ── Estrellas ─────────────────────────────────────────────────────────────
    const makeStars = () => {
      stars = Array.from({ length: 180 }, () => ({
        x:     Math.random() * W,
        y:     Math.random() * H * 0.65,
        r:     0.3 + Math.random() * 1.2,
        twink: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.04,
      }));
    };

    // ── Niebla ────────────────────────────────────────────────────────────────
    const makeFog = () => {
      fogLayers = Array.from({ length: 6 }, (_, i) => ({
        x:     Math.random() * W,
        y:     H * (0.48 + i * 0.04),
        w:     200 + Math.random() * 300,
        h:     40  + Math.random() * 60,
        speed: 0.08 + Math.random() * 0.12,
        alpha: 0.03 + Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    // ── Murciélagos ───────────────────────────────────────────────────────────
    const makeBat = () => ({
      x:     Math.random() * (W || 800),
      y:     30 + Math.random() * ((H || 600) * 0.45),
      speed: 0.5 + Math.random() * 0.8,
      dir:   Math.random() > 0.5 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
      flapS: 0.07 + Math.random() * 0.06,
      size:  5 + Math.random() * 8,
      vy:    (Math.random() - 0.5) * 0.12,
    });

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
      bats = Array.from({ length: 10 }, makeBat);
      makeStars();
      makeFog();
    };

    // ── Castillo ──────────────────────────────────────────────────────────────
    const drawCastle = (r, g, b) => {
      const base = H * 0.58;
      const cx   = W * 0.5;

      // cielo
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0,   `rgb(${Math.max(2,Math.round(r*0.018))},${Math.max(1,Math.round(g*0.006))},${Math.max(4,Math.round(b*0.03))})`);
      sky.addColorStop(0.55,`rgb(${Math.max(5,Math.round(r*0.04))},${Math.max(2,Math.round(g*0.012))},${Math.max(8,Math.round(b*0.06))})`);
      sky.addColorStop(1,   `rgb(${Math.max(3,Math.round(r*0.025))},${Math.max(1,Math.round(g*0.008))},${Math.max(5,Math.round(b*0.04))})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // estrellas
      for (const s of stars) {
        const a = 0.4 + Math.sin(t * s.speed + s.twink) * 0.35;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.min(r+160,255)},${Math.min(g+150,255)},${Math.min(b+160,255)},${a})`;
        ctx.fill();
      }

      // halo de luna
      const lx = W * 0.72, ly = H * 0.15, lr = 46;
      const haloG = ctx.createRadialGradient(lx, ly, lr * 0.5, lx, ly, lr * 3.5);
      haloG.addColorStop(0,   `rgba(${Math.min(r+60,255)},${Math.min(g+50,255)},${Math.min(b+80,255)},0.18)`);
      haloG.addColorStop(0.4, `rgba(${Math.min(r+30,255)},${Math.min(g+20,255)},${Math.min(b+50,255)},0.07)`);
      haloG.addColorStop(1,   'transparent');
      ctx.fillStyle = haloG;
      ctx.beginPath(); ctx.arc(lx, ly, lr * 3.5, 0, Math.PI * 2); ctx.fill();

      // luna
      ctx.save();
      ctx.shadowColor = `rgba(${r},${g},${b},0.5)`;
      ctx.shadowBlur  = 35;
      const moonG = ctx.createRadialGradient(lx - lr*0.25, ly - lr*0.25, 0, lx, ly, lr);
      moonG.addColorStop(0,   `rgba(${Math.min(r+155,255)},${Math.min(g+140,255)},${Math.min(b+150,255)},0.98)`);
      moonG.addColorStop(0.55,`rgba(${Math.min(r+90,255)},${Math.min(g+75,255)},${Math.min(b+110,255)},0.8)`);
      moonG.addColorStop(1,   `rgba(${Math.round(r*0.25)},${Math.round(g*0.12)},${Math.round(b*0.4)},0)`);
      ctx.fillStyle = moonG;
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // nubes que cruzan la luna
      for (let i = 0; i < 5; i++) {
        const cx2 = ((t * (0.12 + i*0.04) + i * 240) % (W + 400)) - 200;
        const cy2 = H * (0.08 + i * 0.04);
        const cr  = 55 + i * 25;
        ctx.save();
        ctx.globalAlpha = 0.13 + Math.sin(t*0.004 + i) * 0.03;
        const cg = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, cr);
        cg.addColorStop(0, `rgba(${Math.round(r*0.3)},${Math.round(g*0.1)},${Math.round(b*0.4)},0.9)`);
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(cx2, cy2, cr, 0, Math.PI * 2); ctx.fill();
        // segunda bola de nube desplazada
        ctx.beginPath(); ctx.arc(cx2 + cr*0.6, cy2 + 8, cr*0.7, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // silueta del castillo — negro puro
      ctx.fillStyle = '#000';
      ctx.shadowColor = `rgba(${r},${g},${b},0.12)`;
      ctx.shadowBlur  = 18;

      const poly = (pts) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath(); ctx.fill();
      };

      // suelo y base del castillo
      poly([[0, base], [W, base], [W, H], [0, H]]);

      // cuerpo central
      poly([
        [cx-180, base], [cx-180, base-110],
        [cx-160, base-110], [cx-160, base-140],
        [cx-130, base-140], [cx-130, base-110],
        [cx-70,  base-110], [cx-70,  base-175],
        [cx-48,  base-175], [cx-48,  base-210],
        [cx-24,  base-210], [cx-24,  base-235],
        [cx,     base-248], [cx+24,  base-235],
        [cx+24,  base-210], [cx+48,  base-210],
        [cx+48,  base-175], [cx+70,  base-175],
        [cx+70,  base-110], [cx+130, base-110],
        [cx+130, base-140], [cx+160, base-140],
        [cx+160, base-110], [cx+180, base-110],
        [cx+180, base],
      ]);

      // almenas torre central
      for (let i = -3; i <= 3; i++) {
        poly([[cx+i*16-6, base-255], [cx+i*16+6, base-255],
              [cx+i*16+6, base-272], [cx+i*16-6, base-272]]);
      }

      // almenas torres laterales izquierda
      [-145,-127,-109].forEach(ox => {
        poly([[cx+ox,   base-148], [cx+ox+9, base-148],
              [cx+ox+9, base-160], [cx+ox,   base-160]]);
      });
      // almenas torres laterales derecha
      [100,118,136].forEach(ox => {
        poly([[cx+ox,   base-148], [cx+ox+9, base-148],
              [cx+ox+9, base-160], [cx+ox,   base-160]]);
      });

      // torres extra en los extremos
      poly([
        [cx-260, base], [cx-260, base-70],
        [cx-240, base-70], [cx-240, base-90],
        [cx-220, base-90], [cx-220, base-70],
        [cx-200, base-70], [cx-200, base],
      ]);
      poly([
        [cx+200, base], [cx+200, base-70],
        [cx+220, base-70], [cx+220, base-90],
        [cx+240, base-90], [cx+240, base-70],
        [cx+260, base-70], [cx+260, base],
      ]);
      // almenas torres extremas
      [-255,-243,-231].forEach(ox => {
        poly([[cx+ox,   base-98], [cx+ox+8, base-98],
              [cx+ox+8, base-108],[cx+ox,   base-108]]);
      });
      [221,233,245].forEach(ox => {
        poly([[cx+ox,   base-98], [cx+ox+8, base-98],
              [cx+ox+8, base-108],[cx+ox,   base-108]]);
      });

      // arco de entrada
      ctx.beginPath();
      ctx.arc(cx, base, 28, Math.PI, 0);
      ctx.lineTo(cx+28, base+2);
      ctx.lineTo(cx-28, base+2);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();

      // ventanas con parpadeo accent
      ctx.shadowBlur = 0;
      const windows = [
        [cx-22, base-185, 9, 14],
        [cx+10,  base-185, 9, 14],
        [cx-85,  base-148, 7, 11],
        [cx+70,  base-148, 7, 11],
        [cx-235, base-80,  6, 9],
        [cx+223, base-80,  6, 9],
      ];
      windows.forEach(([wx, wy, ww, wh]) => {
        const wg = ctx.createRadialGradient(wx+ww*0.5, wy+wh*0.5, 0, wx+ww*0.5, wy+wh*0.5, ww*1.8);
        wg.addColorStop(0,   `rgba(${Math.min(r+120,255)},${Math.min(g+80,255)},${Math.min(b+40,255)},0.65)`);
        wg.addColorStop(0.6, `rgba(${r},${g},${Math.round(b*0.5)},0.35)`);
        wg.addColorStop(1,   'transparent');
        ctx.fillStyle = wg;
        ctx.fillRect(wx - ww, wy - wh, ww*3, wh*3);
        ctx.fillStyle = `rgba(${Math.min(r+80,255)},${Math.min(g+60,255)},${Math.min(b+30,255)},0.55)`;
        ctx.fillRect(wx, wy, ww, wh);
      });
    };

    // ── Niebla ────────────────────────────────────────────────────────────────
    const drawFog = (r, g, b) => {
      for (const f of fogLayers) {
        f.x += f.speed;
        if (f.x > W + f.w) f.x = -f.w;
        const pulse = f.alpha * (0.7 + Math.sin(t * 0.008 + f.phase) * 0.3);
        const fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.w * 0.8);
        fg.addColorStop(0,   `rgba(${Math.round(r*0.15)},${Math.round(g*0.08)},${Math.round(b*0.22)},${pulse})`);
        fg.addColorStop(1,   'transparent');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.w, f.h, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // ── Murciélagos ───────────────────────────────────────────────────────────
    const drawBat = (b, r, g, bb) => {
      const flap  = Math.sin(t * b.flapS * 60 + b.phase);
      const s     = b.size;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.dir, 1);
      ctx.fillStyle = `rgba(${Math.max(0,Math.round(r*0.08))},${Math.max(0,Math.round(g*0.03))},${Math.max(0,Math.round(bb*0.12))},0.9)`;

      // alas
      [-1, 1].forEach(side => {
        const wingAngle = flap * 0.6 * side;
        ctx.save();
        ctx.rotate(wingAngle * 0.4);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(side*s*0.5, -s*0.55, side*s*1.0, -s*0.15, side*s*0.9, s*0.15);
        ctx.bezierCurveTo(side*s*0.6,  s*0.2,  side*s*0.25, s*0.08, 0, 0);
        ctx.fill();
        // dedo del ala
        ctx.beginPath();
        ctx.moveTo(side*s*0.5, -s*0.3);
        ctx.lineTo(side*s*0.85, -s*0.35);
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.stroke();
        ctx.restore();
      });

      // cuerpo
      ctx.beginPath();
      ctx.ellipse(0, 0, s*0.28, s*0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // cabeza
      ctx.beginPath();
      ctx.ellipse(s*0.22, -s*0.1, s*0.15, s*0.13, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // orejas
      ctx.beginPath();
      ctx.moveTo(s*0.16, -s*0.2);
      ctx.lineTo(s*0.12, -s*0.32);
      ctx.lineTo(s*0.22, -s*0.22);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s*0.26, -s*0.2);
      ctx.lineTo(s*0.28, -s*0.33);
      ctx.lineTo(s*0.34, -s*0.21);
      ctx.fill();

      ctx.restore();
    };

    // ── Relámpago ─────────────────────────────────────────────────────────────
    const triggerLightning = () => {
      lightningTimer--;
      if (!lightning && lightningTimer <= 0 && Math.random() > 0.994) {
        const branches = [];
        const buildBranch = (x, y, dx, maxY, depth) => {
          const pts = [[x, y]];
          let cx = x, cy = y;
          while (cy < maxY) {
            cx += dx + (Math.random() - 0.5) * 28;
            cy += 15 + Math.random() * 18;
            pts.push([cx, cy]);
            if (depth > 0 && Math.random() > 0.6) {
              buildBranch(cx, cy, (Math.random()-0.5)*20, cy + 60 + Math.random()*60, depth-1);
            }
          }
          branches.push({ pts, width: depth === 2 ? 2 : 1, alpha: depth === 2 ? 1 : 0.5 });
        };
        buildBranch(W * 0.3 + Math.random() * W * 0.4, 0, 0, H * 0.58, 2);
        lightning = { branches, flash: 1.0 };
        lightningTimer = 120 + Math.floor(Math.random() * 240);
      }
    };

    const drawLightning = (r, g, b) => {
      if (!lightning) return;

      // flash de pantalla
      ctx.save();
      ctx.globalAlpha = lightning.flash * 0.18;
      ctx.fillStyle   = `rgb(${Math.min(r+120,255)},${Math.min(g+100,255)},${Math.min(b+140,255)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // ramas del rayo
      for (const branch of lightning.branches) {
        ctx.save();
        ctx.globalAlpha = lightning.flash * branch.alpha;
        ctx.strokeStyle = `rgb(${Math.min(r+140,255)},${Math.min(g+120,255)},255)`;
        ctx.lineWidth   = branch.width;
        ctx.shadowColor = `rgba(${Math.min(r+80,255)},${Math.min(g+60,255)},255,1)`;
        ctx.shadowBlur  = 18;
        ctx.beginPath();
        ctx.moveTo(branch.pts[0][0], branch.pts[0][1]);
        for (let i = 1; i < branch.pts.length; i++) ctx.lineTo(branch.pts[i][0], branch.pts[i][1]);
        ctx.stroke();
        ctx.restore();
      }

      lightning.flash -= 0.07;
      if (lightning.flash <= 0) lightning = null;
    };

    // ── Loop principal ────────────────────────────────────────────────────────
    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t++;
      const [r, g, b] = this.accent.rgb ?? [139, 92, 246];

      drawCastle(r, g, b);
      drawFog(r, g, b);
      drawLightning(r, g, b);
      triggerLightning();

      for (const bat of bats) {
        bat.x += bat.speed * bat.dir;
        bat.y += bat.vy + Math.sin(t * 0.018 + bat.phase) * 0.35;
        if (bat.x > W + 50)  bat.x = -50;
        if (bat.x < -50)     bat.x = W + 50;
        bat.y = Math.max(10, Math.min(H * 0.5, bat.y));
        drawBat(bat, r, g, b);
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
    return html`<canvas ref=${this.canvasRef} style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;" />`;
  }
}
