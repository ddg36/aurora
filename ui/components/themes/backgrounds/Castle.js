const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

const TAU = Math.PI * 2;

export class Castle extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#7f0000');
  }

  componentDidMount() {
    this.accent.start();

    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W = 0, H = 0, t = 0;
    let stars = [];
    let fogLayers = [];
    let bats = [];
    let embers = [];
    let lightning = null;
    let lightningCooldown = 120;

    const liviano = () => esDispositivoLiviano();

    const rand = (a, b) => a + Math.random() * (b - a);

    const makeStars = () => {
      stars = Array.from({ length: liviano() ? 70 : 220 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H * 0.62,
        r: rand(0.35, 1.6),
        tw: Math.random() * TAU,
        sp: rand(0.01, 0.05),
        a: rand(0.35, 0.9),
      }));
    };

    const makeFog = () => {
      fogLayers = Array.from({ length: liviano() ? 6 : 11 }, (_, i) => ({
        x: Math.random() * W,
        y: H * (0.48 + i * 0.042),
        w: rand(180, 420),
        h: rand(28, 78),
        sp: rand(0.08, 0.22),
        a: rand(0.018, 0.07),
        ph: Math.random() * TAU,
      }));
    };

    const makeBat = () => ({
      x: Math.random() * (W || 1200),
      y: rand(40, (H || 700) * 0.44),
      sp: rand(0.35, 1.1),
      dir: Math.random() > 0.5 ? 1 : -1,
      flap: rand(0.07, 0.15),
      ph: Math.random() * TAU,
      size: rand(5, 12),
      vy: rand(-0.08, 0.08),
      depth: rand(0.65, 1.15),
    });

    const makeEmber = () => ({
      x: Math.random() * W,
      y: H * rand(0.68, 0.98),
      r: rand(0.6, 2.2),
      vx: rand(-0.15, 0.15),
      vy: rand(-0.45, -0.1),
      a: rand(0.08, 0.4),
      ph: Math.random() * TAU,
    });

    const makeEmbers = () => {
      embers = Array.from({ length: liviano() ? 18 : 54 }, makeEmber);
    };

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
      makeStars();
      makeFog();
      makeEmbers();
      bats = Array.from({ length: liviano() ? 5 : 12 }, makeBat);
    };

    const polyFill = (pts, fill) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };

    const rect = (x, y, w, h, fill) => {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
    };

    const glowRgb = (r, g, b, a) => `rgba(${r},${g},${b},${a})`;

    const drawSky = (r, g, b) => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0,   `rgb(${Math.max(1, Math.round(r * 0.02))},${Math.max(0, Math.round(g * 0.005))},${Math.max(4, Math.round(b * 0.03))})`);
      sky.addColorStop(0.25,`rgb(${Math.max(5, Math.round(r * 0.035))},${Math.max(1, Math.round(g * 0.009))},${Math.max(8, Math.round(b * 0.05))})`);
      sky.addColorStop(0.62,`rgb(${Math.max(8, Math.round(r * 0.055))},${Math.max(2, Math.round(g * 0.014))},${Math.max(10, Math.round(b * 0.075))})`);
      sky.addColorStop(1,   `rgb(${Math.max(10, Math.round(r * 0.075))},${Math.max(3, Math.round(g * 0.02))},${Math.max(8, Math.round(b * 0.06))})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        const a = s.a * (0.55 + Math.sin(t * s.sp + s.tw) * 0.45);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fillStyle = `rgba(${Math.min(r + 165, 255)},${Math.min(g + 125, 255)},${Math.min(b + 155, 255)},${a})`;
        ctx.fill();
      }
    };

    const drawMoonAndClouds = (r, g, b) => {
      const mx = W * 0.76;
      const my = H * 0.16;
      const mr = Math.min(W, H) * 0.06 + 14;

      const halo = ctx.createRadialGradient(mx, my, mr * 0.45, mx, my, mr * 4.2);
      halo.addColorStop(0, glowRgb(Math.min(r + 85, 255), Math.min(g + 60, 255), Math.min(b + 90, 255), 0.18));
      halo.addColorStop(0.4, glowRgb(Math.min(r + 40, 255), Math.min(g + 30, 255), Math.min(b + 60, 255), 0.08));
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 4.2, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.shadowColor = glowRgb(r, g, b, 0.45);
      ctx.shadowBlur = 28;
      const moon = ctx.createRadialGradient(mx - mr * 0.28, my - mr * 0.25, 0, mx, my, mr);
      moon.addColorStop(0, `rgba(${Math.min(r + 165, 255)},${Math.min(g + 145, 255)},${Math.min(b + 165, 255)},0.98)`);
      moon.addColorStop(0.5, `rgba(${Math.min(r + 105, 255)},${Math.min(g + 92, 255)},${Math.min(b + 120, 255)},0.8)`);
      moon.addColorStop(1, `rgba(${Math.round(r * 0.26)},${Math.round(g * 0.12)},${Math.round(b * 0.34)},0)`);
      ctx.fillStyle = moon;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
      ctx.restore();

      for (let i = 0; i < 6; i++) {
        const cx = ((t * (0.17 + i * 0.03) + i * 220) % (W + 500)) - 250;
        const cy = H * (0.08 + i * 0.045);
        const cr = 42 + i * 20;
        ctx.save();
        ctx.globalAlpha = 0.08 + Math.sin(t * 0.004 + i) * 0.03;
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        cg.addColorStop(0, `rgba(${Math.round(r * 0.25)},${Math.round(g * 0.08)},${Math.round(b * 0.34)},0.9)`);
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, TAU);
        ctx.arc(cx + cr * 0.6, cy + 6, cr * 0.7, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    };

    const drawDistantMountains = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      polyFill([
        [0, H * 0.62],
        [W * 0.08, H * 0.54],
        [W * 0.15, H * 0.59],
        [W * 0.22, H * 0.51],
        [W * 0.3, H * 0.58],
        [W * 0.42, H * 0.49],
        [W * 0.55, H * 0.61],
        [W * 0.63, H * 0.52],
        [W * 0.75, H * 0.58],
        [W * 0.86, H * 0.49],
        [W, H * 0.6],
        [W, H],
        [0, H],
      ], 'rgba(0,0,0,0.28)');

      polyFill([
        [0, H * 0.69],
        [W * 0.12, H * 0.58],
        [W * 0.2, H * 0.65],
        [W * 0.29, H * 0.56],
        [W * 0.37, H * 0.66],
        [W * 0.49, H * 0.54],
        [W * 0.59, H * 0.63],
        [W * 0.71, H * 0.55],
        [W * 0.82, H * 0.68],
        [W * 0.92, H * 0.57],
        [W, H * 0.64],
        [W, H],
        [0, H],
      ], 'rgba(0,0,0,0.42)');
    };

    const drawCliffBase = () => {
      polyFill([
        [0, H],
        [0, H * 0.78],
        [W * 0.06, H * 0.73],
        [W * 0.12, H * 0.75],
        [W * 0.18, H * 0.68],
        [W * 0.26, H * 0.7],
        [W * 0.33, H * 0.63],
        [W * 0.44, H * 0.67],
        [W * 0.55, H * 0.61],
        [W * 0.67, H * 0.66],
        [W * 0.75, H * 0.6],
        [W * 0.86, H * 0.68],
        [W * 0.94, H * 0.64],
        [W, H * 0.7],
        [W, H],
      ], '#020102');

      polyFill([
        [0, H],
        [0, H * 0.84],
        [W * 0.11, H * 0.79],
        [W * 0.2, H * 0.82],
        [W * 0.29, H * 0.76],
        [W * 0.4, H * 0.8],
        [W * 0.5, H * 0.74],
        [W * 0.61, H * 0.79],
        [W * 0.72, H * 0.73],
        [W * 0.82, H * 0.8],
        [W * 0.9, H * 0.75],
        [W, H * 0.81],
        [W, H],
      ], '#000');
    };

    const drawCrenels = (x, y, w, count, h = 12, color = '#000') => {
      const gap = w / count;
      for (let i = 0; i < count; i++) {
        rect(x + i * gap, y, gap * 0.62, h, color);
      }
    };

    const drawSpire = (x, y, w, h, color = '#000') => {
      polyFill([
        [x, y],
        [x + w * 0.5, y - h],
        [x + w, y],
      ], color);
      rect(x + w * 0.46, y - h - h * 0.18, w * 0.08, h * 0.18, color);
    };

    const drawWindowGlow = (x, y, w, h, r, g, b, strength = 1) => {
      const gx = x + w * 0.5;
      const gy = y + h * 0.5;
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 2.6);
      glow.addColorStop(0, `rgba(${Math.min(r + 130, 255)},${Math.min(g + 70, 255)},${Math.min(b + 30, 255)},${0.55 * strength})`);
      glow.addColorStop(0.45, `rgba(${r},${Math.max(0, Math.round(g * 0.55))},${Math.max(0, Math.round(b * 0.35))},${0.28 * strength})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(x - w * 1.5, y - h * 1.5, w * 4, h * 4);

      ctx.fillStyle = `rgba(${Math.min(r + 90, 255)},${Math.min(g + 45, 255)},${Math.min(b + 12, 255)},${0.52 * strength})`;
      ctx.fillRect(x, y, w, h);
    };

    const drawLancetWindow = (x, y, w, h, r, g, b, strength = 1) => {
      const gx = x + w * 0.5;
      const gy = y + h * 0.5;
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 2.6);
      glow.addColorStop(0, `rgba(${Math.min(r + 130, 255)},${Math.min(g + 70, 255)},${Math.min(b + 30, 255)},${0.52 * strength})`);
      glow.addColorStop(0.5, `rgba(${r},${Math.max(0, Math.round(g * 0.55))},${Math.max(0, Math.round(b * 0.35))},${0.24 * strength})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(x - w * 2, y - h * 1.5, w * 5, h * 4);

      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + h * 0.28);
      ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.32, x + w, y + h * 0.28);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fillStyle = `rgba(${Math.min(r + 90, 255)},${Math.min(g + 45, 255)},${Math.min(b + 18, 255)},${0.5 * strength})`;
      ctx.fill();
    };

    const drawTower = (cfg, r, g, b, layer = 1) => {
      const {
        x, baseY, w, h,
        battlements = 4,
        spire = true,
        roofH = h * 0.28,
        slit = true,
        sideWindows = 0,
      } = cfg;

      rect(x, baseY - h, w, h, '#000');
      drawCrenels(x, baseY - h - 10, w, battlements, 10);

      if (spire) drawSpire(x - w * 0.04, baseY - h - 10, w * 1.08, roofH, '#000');

      if (slit) {
        drawLancetWindow(
          x + w * 0.43,
          baseY - h * 0.58,
          Math.max(4, w * 0.12),
          Math.max(12, h * 0.18),
          r, g, b,
          layer === 1 ? 1 : 0.75
        );
      }

      for (let i = 0; i < sideWindows; i++) {
        drawWindowGlow(
          x + w * 0.18 + i * (w * 0.22),
          baseY - h * 0.28,
          Math.max(4, w * 0.08),
          Math.max(6, h * 0.08),
          r, g, b, 0.72
        );
      }
    };

    const drawRearCastle = () => {
      const y = H * 0.62;
      polyFill([
        [W * 0.22, y],
        [W * 0.22, y - 80],
        [W * 0.26, y - 80],
        [W * 0.26, y - 120],
        [W * 0.3, y - 120],
        [W * 0.3, y - 88],
        [W * 0.38, y - 88],
        [W * 0.38, y - 145],
        [W * 0.42, y - 145],
        [W * 0.42, y - 110],
        [W * 0.48, y - 110],
        [W * 0.48, y - 168],
        [W * 0.51, y - 168],
        [W * 0.51, y - 102],
        [W * 0.59, y - 102],
        [W * 0.59, y - 150],
        [W * 0.63, y - 150],
        [W * 0.63, y - 96],
        [W * 0.7, y - 96],
        [W * 0.7, y],
      ], 'rgba(0,0,0,0.76)');
    };

    const drawMainCastle = (r, g, b) => {
      const base = H * 0.67;
      const cx = W * 0.52;

      // muralla principal / plataforma
      polyFill([
        [cx - 300, base],
        [cx - 300, base - 44],
        [cx - 235, base - 44],
        [cx - 235, base - 88],
        [cx - 190, base - 88],
        [cx - 190, base - 62],
        [cx - 120, base - 62],
        [cx - 120, base - 102],
        [cx - 32, base - 102],
        [cx - 32, base - 142],
        [cx + 58, base - 142],
        [cx + 58, base - 98],
        [cx + 148, base - 98],
        [cx + 148, base - 58],
        [cx + 238, base - 58],
        [cx + 238, base - 84],
        [cx + 292, base - 84],
        [cx + 292, base - 40],
        [cx + 360, base - 40],
        [cx + 360, base],
      ], '#000');

      // almenas generales
      drawCrenels(cx - 296, base - 54, 58, 3, 10);
      drawCrenels(cx - 188, base - 98, 42, 3, 10);
      drawCrenels(cx - 117, base - 112, 80, 5, 10);
      drawCrenels(cx + 60, base - 108, 82, 5, 10);
      drawCrenels(cx + 240, base - 94, 44, 3, 10);
      drawCrenels(cx + 294, base - 50, 58, 3, 10);

      // keep central, alto y dominante
      drawTower({
        x: cx - 46,
        baseY: base - 102,
        w: 92,
        h: 176,
        battlements: 5,
        spire: true,
        roofH: 96,
        sideWindows: 2,
      }, r, g, b, 1);

      // mega aguja trasera ligeramente descentrada
      rect(cx - 10, base - 278, 20, 116, '#000');
      drawSpire(cx - 24, base - 278, 48, 118, '#000');
      rect(cx - 2, base - 416, 4, 22, '#000');

      // torre izquierda ancha
      drawTower({
        x: cx - 176,
        baseY: base - 62,
        w: 58,
        h: 126,
        battlements: 4,
        spire: true,
        roofH: 74,
        sideWindows: 1,
      }, r, g, b, 1);

      // torre derecha media
      drawTower({
        x: cx + 108,
        baseY: base - 58,
        w: 54,
        h: 118,
        battlements: 4,
        spire: true,
        roofH: 70,
        sideWindows: 1,
      }, r, g, b, 1);

      // torre extrema izquierda, más baja y gruesa
      drawTower({
        x: cx - 286,
        baseY: base - 44,
        w: 48,
        h: 92,
        battlements: 3,
        spire: true,
        roofH: 52,
        slit: false,
        sideWindows: 1,
      }, r, g, b, 1);

      // torre extrema derecha, más alta y fina
      drawTower({
        x: cx + 300,
        baseY: base - 40,
        w: 40,
        h: 132,
        battlements: 3,
        spire: true,
        roofH: 86,
        sideWindows: 0,
      }, r, g, b, 1);

      // torres traseras secundarias
      drawTower({
        x: cx - 96,
        baseY: base - 118,
        w: 30,
        h: 68,
        battlements: 3,
        spire: true,
        roofH: 42,
        slit: false,
        sideWindows: 0,
      }, r, g, b, 0);

      drawTower({
        x: cx + 68,
        baseY: base - 116,
        w: 26,
        h: 72,
        battlements: 3,
        spire: true,
        roofH: 46,
        slit: false,
        sideWindows: 0,
      }, r, g, b, 0);

      // contrafuertes simples
      polyFill([
        [cx - 236, base],
        [cx - 216, base],
        [cx - 204, base - 36],
        [cx - 224, base - 36],
      ], '#000');

      polyFill([
        [cx + 182, base],
        [cx + 204, base],
        [cx + 194, base - 34],
        [cx + 174, base - 34],
      ], '#000');

      // portón
      ctx.beginPath();
      ctx.moveTo(cx - 28, base);
      ctx.lineTo(cx - 28, base - 38);
      ctx.quadraticCurveTo(cx, base - 72, cx + 28, base - 38);
      ctx.lineTo(cx + 28, base);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();

      // glow portón
      const gateGlow = ctx.createRadialGradient(cx, base - 18, 0, cx, base - 18, 64);
      gateGlow.addColorStop(0, `rgba(${Math.min(r + 120, 255)},${Math.min(g + 70, 255)},${Math.min(b + 18, 255)},0.26)`);
      gateGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = gateGlow;
      ctx.fillRect(cx - 70, base - 100, 140, 110);

      // puentecito / entrada frontal
      polyFill([
        [cx - 54, base],
        [cx + 42, base],
        [cx + 26, base + 18],
        [cx - 64, base + 18],
      ], '#010101');

      // ventanas extra muralla
      const windows = [
        [cx - 264, base - 58, 5, 8],
        [cx - 152, base - 84, 5, 10],
        [cx - 130, base - 84, 5, 10],
        [cx - 12,  base - 176, 7, 15],
        [cx + 12,  base - 176, 7, 15],
        [cx + 122, base - 82, 5, 9],
        [cx + 138, base - 82, 5, 9],
        [cx + 312, base - 60, 4, 8],
      ];
      for (const [wx, wy, ww, wh] of windows) {
        drawWindowGlow(wx, wy, ww, wh, r, g, b, 0.85);
      }
    };

    const drawForegroundSpikes = () => {
      const y = H * 0.88;
      ctx.fillStyle = '#000';
      for (let x = -20; x < W + 30; x += 26) {
        const h = 18 + Math.sin(x * 0.043) * 8 + Math.random() * 10;
        polyFill([
          [x, y],
          [x + 8, y - h],
          [x + 16, y],
        ], '#000');
      }

      // dos cruces sutiles
      const crosses = [
        [W * 0.17, H * 0.82, 18],
        [W * 0.84, H * 0.8, 16],
      ];
      crosses.forEach(([x, y, s]) => {
        rect(x, y - s, 3, s * 1.2, '#000');
        rect(x - s * 0.35, y - s * 0.55, s * 0.7, 3, '#000');
      });
    };

    const drawFog = (r, g, b) => {
      for (const f of fogLayers) {
        f.x += f.sp;
        if (f.x > W + f.w) f.x = -f.w;

        const alpha = f.a * (0.7 + Math.sin(t * 0.008 + f.ph) * 0.3);
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.w * 0.8);
        grad.addColorStop(0, `rgba(${Math.round(r * 0.16)},${Math.round(g * 0.05)},${Math.round(b * 0.18)},${alpha})`);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(
          f.x + Math.sin(t * 0.003 + f.ph) * 18,
          f.y,
          f.w,
          f.h,
          0,
          0,
          TAU
        );
        ctx.fill();
      }
    };

    const drawEmbers = (r, g, b) => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const e of embers) {
        e.x += e.vx + Math.sin(t * 0.03 + e.ph) * 0.08;
        e.y += e.vy;
        if (e.y < H * 0.6 || e.x < -10 || e.x > W + 10) {
          e.x = Math.random() * W;
          e.y = H * rand(0.76, 0.98);
        }
        const a = e.a * (0.65 + Math.sin(t * 0.05 + e.ph) * 0.35);
        const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 6);
        glow.addColorStop(0, `rgba(${Math.min(r + 140,255)},${Math.min(g + 60,255)},${Math.min(b + 25,255)},${a})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 6, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawBat = (bat, r, g, bb) => {
      const flap = Math.sin(t * bat.flap * 60 + bat.ph);
      const s = bat.size * bat.depth;
      ctx.save();
      ctx.translate(bat.x, bat.y);
      ctx.scale(bat.dir, 1);
      ctx.fillStyle = `rgba(${Math.max(0, Math.round(r * 0.08))},${Math.max(0, Math.round(g * 0.03))},${Math.max(0, Math.round(bb * 0.1))},0.92)`;

      [-1, 1].forEach(side => {
        const wingAngle = flap * 0.58 * side;
        ctx.save();
        ctx.rotate(wingAngle * 0.36);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(side * s * 0.52, -s * 0.56, side * s * 1.08, -s * 0.16, side * s * 0.94, s * 0.14);
        ctx.bezierCurveTo(side * s * 0.66, s * 0.24, side * s * 0.26, s * 0.08, 0, 0);
        ctx.fill();
        ctx.restore();
      });

      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.26, s * 0.18, 0, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(s * 0.22, -s * 0.08, s * 0.14, s * 0.12, -0.22, 0, TAU);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(s * 0.12, -s * 0.18);
      ctx.lineTo(s * 0.1, -s * 0.31);
      ctx.lineTo(s * 0.2, -s * 0.21);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(s * 0.22, -s * 0.18);
      ctx.lineTo(s * 0.28, -s * 0.33);
      ctx.lineTo(s * 0.33, -s * 0.21);
      ctx.fill();

      ctx.restore();
    };

    const triggerLightning = () => {
      lightningCooldown--;
      if (lightning || lightningCooldown > 0) return;
      if (Math.random() < 0.0105) {
        const branches = [];
        const build = (x, y, dx, maxY, depth) => {
          const pts = [[x, y]];
          let cx = x, cy = y;
          while (cy < maxY) {
            cx += dx + (Math.random() - 0.5) * 34;
            cy += rand(12, 24);
            pts.push([cx, cy]);
            if (depth > 0 && Math.random() > 0.64) {
              build(cx, cy, rand(-16, 16), cy + rand(40, 90), depth - 1);
            }
          }
          branches.push({ pts, width: depth === 2 ? 2.2 : depth === 1 ? 1.5 : 1, alpha: depth === 2 ? 1 : 0.56 });
        };
        build(W * rand(0.22, 0.78), 0, 0, H * rand(0.4, 0.58), 2);
        lightning = { branches, flash: 1 };
        lightningCooldown = Math.floor(rand(110, 260));
      }
    };

    const drawLightning = (r, g, b) => {
      if (!lightning) return;

      ctx.save();
      ctx.globalAlpha = lightning.flash * 0.18;
      ctx.fillStyle = `rgb(${Math.min(r + 120, 255)},${Math.min(g + 90, 255)},${Math.min(b + 135, 255)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      for (const branch of lightning.branches) {
        ctx.save();
        ctx.globalAlpha = lightning.flash * branch.alpha;
        ctx.strokeStyle = `rgb(${Math.min(r + 140, 255)},${Math.min(g + 120, 255)},255)`;
        ctx.lineWidth = branch.width;
        ctx.shadowColor = `rgba(${Math.min(r + 80, 255)},${Math.min(g + 60, 255)},255,1)`;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(branch.pts[0][0], branch.pts[0][1]);
        for (let i = 1; i < branch.pts.length; i++) ctx.lineTo(branch.pts[i][0], branch.pts[i][1]);
        ctx.stroke();
        ctx.restore();
      }

      lightning.flash -= 0.075;
      if (lightning.flash <= 0) lightning = null;
    };

    let raf = 0;
    const draw = () => {
      raf = sceneFrame(draw);
      t++;

      const [r, g, b] = this.accent.rgb ?? [127, 0, 0];

      drawSky(r, g, b);
      drawMoonAndClouds(r, g, b);
      drawDistantMountains();
      drawRearCastle();
      drawCliffBase();
      drawMainCastle(r, g, b);
      drawFog(r, g, b);
      drawLightning(r, g, b);
      triggerLightning();

      for (const bat of bats) {
        bat.x += bat.sp * bat.dir;
        bat.y += bat.vy + Math.sin(t * 0.018 + bat.ph) * 0.25;
        if (bat.x > W + 60) bat.x = -60;
        if (bat.x < -60) bat.x = W + 60;
        bat.y = Math.max(20, Math.min(H * 0.48, bat.y));
        drawBat(bat, r, g, b);
      }

      drawForegroundSpikes();
      drawEmbers(r, g, b);

      const vignette = ctx.createRadialGradient(W * 0.5, H * 0.46, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(0.7, 'rgba(0,0,0,0.06)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.36)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
    };

    resize();
    draw();

    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);
    this._stop = () => {
      cancelSceneFrame(raf);
      this._ro?.disconnect();
    };
  }

  componentWillUnmount() {
    this._stop?.();
    this.accent.stop();
  }

  render() {
    return html`
      <canvas
        ref=${this.canvasRef}
        class="fixed inset-0 w-full h-full pointer-events-none"
        style="z-index:-1;background:#030002;will-change:transform"
      />
    `;
  }
}
