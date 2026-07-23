const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano, fitCanvas, sceneFrame, cancelSceneFrame } from '../lib.js';

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
    let rainDrops = [];
    let lightning = null;
    let lightningCooldown = 180;
    let windowStates = []; // true=encendida, false=apagada

    const liviano = () => esDispositivoLiviano();
    const rand = (a, b) => a + Math.random() * (b - a);

    const makeStars = () => {
      stars = Array.from({ length: liviano() ? 60 : 180 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H * 0.55,
        r: rand(0.3, 1.4),
        tw: Math.random() * TAU,
        sp: rand(0.008, 0.04),
        a: rand(0.3, 0.85),
      }));
    };

    const makeFog = () => {
      fogLayers = Array.from({ length: liviano() ? 5 : 9 }, (_, i) => ({
        x: Math.random() * W,
        y: H * (0.45 + i * 0.055),
        w: rand(200, 480),
        h: rand(32, 85),
        sp: rand(0.06, 0.18),
        a: rand(0.015, 0.06),
        ph: Math.random() * TAU,
        layer: i % 3,
      }));
    };

    const makeBat = () => ({
      x: Math.random() * (W || 1200),
      y: rand(50, (H || 700) * 0.42),
      sp: rand(0.3, 1.0),
      dir: Math.random() > 0.5 ? 1 : -1,
      flap: rand(0.06, 0.14),
      ph: Math.random() * TAU,
      size: rand(5, 11),
      vy: rand(-0.06, 0.06),
      depth: rand(0.6, 1.1),
      targetX: rand(0, W),
      targetY: rand(H * 0.15, H * 0.4),
      turnTimer: rand(60, 180),
    });

    const makeEmber = () => ({
      x: Math.random() * W,
      y: H * rand(0.65, 0.95),
      r: rand(0.5, 2.0),
      vx: rand(-0.12, 0.12),
      vy: rand(-0.38, -0.08),
      a: rand(0.06, 0.35),
      ph: Math.random() * TAU,
    });

    const makeRain = () => {
      rainDrops = Array.from({ length: liviano() ? 40 : 100 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        len: rand(8, 22),
        sp: rand(3.5, 6.5),
        a: rand(0.04, 0.14),
      }));
    };

    const makeEmbers = () => {
      embers = Array.from({ length: liviano() ? 15 : 45 }, makeEmber);
    };

    const makeWindowStates = () => {
      windowStates = Array.from({ length: 14 }, () => Math.random() > 0.35);
    };

    const resize = () => {
      const size = fitCanvas(canvas, ctx, { maxDpr: 1.5 });
      W = size.width;
      H = size.height;
      makeStars();
      makeFog();
      makeEmbers();
      makeRain();
      makeWindowStates();
      bats = Array.from({ length: liviano() ? 4 : 10 }, makeBat);
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

    const drawSky = (r, g, b) => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, `rgb(${Math.max(1, Math.round(r * 0.015))},${Math.max(0, Math.round(g * 0.004))},${Math.max(3, Math.round(b * 0.025))})`);
      sky.addColorStop(0.3, `rgb(${Math.max(4, Math.round(r * 0.03))},${Math.max(1, Math.round(g * 0.007))},${Math.max(6, Math.round(b * 0.045))})`);
      sky.addColorStop(0.65, `rgb(${Math.max(7, Math.round(r * 0.05))},${Math.max(2, Math.round(g * 0.012))},${Math.max(8, Math.round(b * 0.065))})`);
      sky.addColorStop(1, `rgb(${Math.max(9, Math.round(r * 0.065))},${Math.max(2, Math.round(g * 0.016))},${Math.max(6, Math.round(b * 0.055))})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        const a = s.a * (0.5 + Math.sin(t * s.sp + s.tw) * 0.5);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fillStyle = `rgba(${Math.min(r + 155, 255)},${Math.min(g + 115, 255)},${Math.min(b + 145, 255)},${a})`;
        ctx.fill();
      }
    };

    const drawMoonAndClouds = (r, g, b) => {
      const mx = W * 0.72;
      const my = H * 0.14;
      const mr = Math.min(W, H) * 0.055 + 12;

      // Halo dramático
      const halo = ctx.createRadialGradient(mx, my, mr * 0.3, mx, my, mr * 5.0);
      halo.addColorStop(0, `rgba(${Math.min(r + 95, 255)},${Math.min(g + 70, 255)},${Math.min(b + 100, 255)},0.22)`);
      halo.addColorStop(0.3, `rgba(${Math.min(r + 55, 255)},${Math.min(g + 40, 255)},${Math.min(b + 70, 255)},0.1)`);
      halo.addColorStop(0.7, `rgba(${Math.min(r + 25, 255)},${Math.min(g + 15, 255)},${Math.min(b + 40, 255)},0.04)`);
      halo.addColorStop(1, 'transparent');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 5.0, 0, TAU);
      ctx.fill();

      // Luna con crateres simulados
      ctx.save();
      ctx.shadowColor = `rgba(${r},${g},${b},0.5)`;
      ctx.shadowBlur = 35;
      const moon = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.28, 0, mx, my, mr);
      moon.addColorStop(0, `rgba(${Math.min(r + 175, 255)},${Math.min(g + 155, 255)},${Math.min(b + 175, 255)},0.99)`);
      moon.addColorStop(0.45, `rgba(${Math.min(r + 115, 255)},${Math.min(g + 100, 255)},${Math.min(b + 130, 255)},0.85)`);
      moon.addColorStop(0.85, `rgba(${Math.round(r * 0.3)},${Math.round(g * 0.15)},${Math.round(b * 0.4)},0.5)`);
      moon.addColorStop(1, `rgba(${Math.round(r * 0.15)},${Math.round(g * 0.08)},${Math.round(b * 0.2)},0)`);
      ctx.fillStyle = moon;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
      ctx.restore();

      // Crateres sutiles en la luna
      ctx.save();
      ctx.globalAlpha = 0.12;
      const craters = [[0.25, 0.2, 0.12], [-0.15, 0.35, 0.08], [0.35, -0.1, 0.06], [-0.25, -0.2, 0.09]];
      for (const [cx, cy, cr] of craters) {
        ctx.beginPath();
        ctx.arc(mx + cx * mr, my + cy * mr, cr * mr, 0, TAU);
        ctx.fillStyle = `rgba(${Math.round(r * 0.3)},${Math.round(g * 0.15)},${Math.round(b * 0.3)},0.3)`;
        ctx.fill();
      }
      ctx.restore();

      // Nubes dramáticas con capas
      for (let i = 0; i < 7; i++) {
        const cx = ((t * (0.12 + i * 0.025) + i * 240) % (W + 600)) - 300;
        const cy = H * (0.06 + i * 0.05);
        const cr = 48 + i * 24;
        ctx.save();
        ctx.globalAlpha = 0.06 + Math.sin(t * 0.003 + i * 0.8) * 0.025;
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
        cg.addColorStop(0, `rgba(${Math.round(r * 0.2)},${Math.round(g * 0.06)},${Math.round(b * 0.28)},0.85)`);
        cg.addColorStop(0.6, `rgba(${Math.round(r * 0.1)},${Math.round(g * 0.03)},${Math.round(b * 0.15)},0.4)`);
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(cx, cy, cr, cr * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    };

    const drawDistantMountains = () => {
      // Capa 1: montañas lejanas con niebla
      const gradient1 = ctx.createLinearGradient(0, H * 0.45, 0, H * 0.65);
      gradient1.addColorStop(0, 'rgba(8,4,12,0.6)');
      gradient1.addColorStop(1, 'rgba(4,2,6,0.3)');
      polyFill([
        [0, H * 0.62],
        [W * 0.05, H * 0.52], [W * 0.12, H * 0.56], [W * 0.2, H * 0.48],
        [W * 0.28, H * 0.55], [W * 0.38, H * 0.46], [W * 0.48, H * 0.54],
        [W * 0.58, H * 0.44], [W * 0.68, H * 0.52], [W * 0.78, H * 0.45],
        [W * 0.88, H * 0.53], [W, H * 0.58],
        [W, H * 0.65], [0, H * 0.65],
      ], gradient1);

      // Capa 2: montañas medias
      polyFill([
        [0, H * 0.66],
        [W * 0.08, H * 0.56], [W * 0.16, H * 0.62], [W * 0.25, H * 0.53],
        [W * 0.35, H * 0.6], [W * 0.45, H * 0.51], [W * 0.55, H * 0.59],
        [W * 0.65, H * 0.52], [W * 0.75, H * 0.6], [W * 0.85, H * 0.54],
        [W, H * 0.62],
        [W, H * 0.68], [0, H * 0.68],
      ], 'rgba(3,1,5,0.55)');

      // Capa 3: colinas cercanas
      polyFill([
        [0, H * 0.72],
        [W * 0.1, H * 0.64], [W * 0.2, H * 0.68], [W * 0.32, H * 0.62],
        [W * 0.42, H * 0.67], [W * 0.52, H * 0.61], [W * 0.62, H * 0.66],
        [W * 0.72, H * 0.62], [W * 0.82, H * 0.67], [W * 0.92, H * 0.63],
        [W, H * 0.66],
        [W, H * 0.74], [0, H * 0.74],
      ], 'rgba(2,0,3,0.7)');
    };

    const drawCliffBase = () => {
      // Acantilado con textura de grietas
      polyFill([
        [0, H],
        [0, H * 0.76],
        [W * 0.05, H * 0.71], [W * 0.1, H * 0.74], [W * 0.16, H * 0.67],
        [W * 0.23, H * 0.69], [W * 0.3, H * 0.62], [W * 0.38, H * 0.66],
        [W * 0.46, H * 0.6], [W * 0.55, H * 0.64], [W * 0.64, H * 0.59],
        [W * 0.73, H * 0.64], [W * 0.82, H * 0.67], [W * 0.9, H * 0.62],
        [W * 0.96, H * 0.66],
        [W, H * 0.68],
        [W, H],
      ], '#010001');

      // Grietas verticales en el acantilado
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const x = W * (0.05 + i * 0.08);
        const startY = H * (0.65 + (i % 3) * 0.04);
        ctx.beginPath();
        ctx.moveTo(x, startY);
        ctx.lineTo(x + rand(-3, 3), H);
        ctx.stroke();
      }

      // Suelo irregular
      polyFill([
        [0, H],
        [0, H * 0.82],
        [W * 0.08, H * 0.78], [W * 0.18, H * 0.81], [W * 0.28, H * 0.76],
        [W * 0.38, H * 0.79], [W * 0.48, H * 0.74], [W * 0.58, H * 0.78],
        [W * 0.68, H * 0.74], [W * 0.78, H * 0.79], [W * 0.88, H * 0.75],
        [W, H * 0.78],
        [W, H],
      ], '#000');
    };

    const drawCrenels = (x, y, w, count, h = 10, color = '#000') => {
      const gap = w / count;
      for (let i = 0; i < count; i++) {
        rect(x + i * gap + 1, y, gap * 0.55, h, color);
        // Pequeña sombra en la almena
        rect(x + i * gap + 1, y + h - 2, gap * 0.55, 2, 'rgba(0,0,0,0.5)');
      }
    };

    const drawSpire = (x, y, w, h, color = '#000') => {
      polyFill([
        [x, y],
        [x + w * 0.5, y - h],
        [x + w, y],
      ], color);
      // Bandera/cresta en la punta
      rect(x + w * 0.46, y - h - h * 0.2, w * 0.06, h * 0.2, color);
      rect(x + w * 0.42, y - h - h * 0.25, w * 0.14, 3, color);
    };

    const drawLancetWindow = (x, y, w, h, r, g, b, strength = 1, lit = true) => {
      if (!lit) {
        rect(x, y, w, h, 'rgba(10,8,12,0.8)');
        return;
      }
      const gx = x + w * 0.5;
      const gy = y + h * 0.5;
      // Glow exterior
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 3.2);
      glow.addColorStop(0, `rgba(${Math.min(r + 140, 255)},${Math.min(g + 80, 255)},${Math.min(b + 35, 255)},${0.6 * strength})`);
      glow.addColorStop(0.35, `rgba(${r},${Math.max(0, Math.round(g * 0.6))},${Math.max(0, Math.round(b * 0.4))},${0.3 * strength})`);
      glow.addColorStop(0.7, `rgba(${Math.round(r * 0.5)},${Math.round(g * 0.25)},${Math.round(b * 0.2)},${0.1 * strength})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(x - w * 2, y - h * 1.8, w * 5, h * 4.5);

      // Ventana en forma de arco apuntado
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + h * 0.3);
      ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.35, x + w, y + h * 0.3);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fillStyle = `rgba(${Math.min(r + 100, 255)},${Math.min(g + 55, 255)},${Math.min(b + 22, 255)},${0.55 * strength})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Cruz de la ventana
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.5, y + h * 0.15);
      ctx.lineTo(x + w * 0.5, y + h * 0.85);
      ctx.moveTo(x + w * 0.15, y + h * 0.5);
      ctx.lineTo(x + w * 0.85, y + h * 0.5);
      ctx.stroke();
    };

    const drawWindowGlow = (x, y, w, h, r, g, b, strength = 1, lit = true) => {
      if (!lit) {
        rect(x, y, w, h, 'rgba(10,8,12,0.7)');
        return;
      }
      const gx = x + w * 0.5;
      const gy = y + h * 0.5;
      const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * 2.8);
      glow.addColorStop(0, `rgba(${Math.min(r + 135, 255)},${Math.min(g + 75, 255)},${Math.min(b + 32, 255)},${0.58 * strength})`);
      glow.addColorStop(0.4, `rgba(${r},${Math.max(0, Math.round(g * 0.58))},${Math.max(0, Math.round(b * 0.38))},${0.28 * strength})`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(x - w * 1.8, y - h * 1.6, w * 4.6, h * 4.2);

      rect(x, y, w, h, `rgba(${Math.min(r + 95, 255)},${Math.min(g + 50, 255)},${Math.min(b + 15, 255)},${0.55 * strength})`);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    };

    const drawTower = (cfg, r, g, b, layer = 1) => {
      const { x, baseY, w, h, battlements = 4, spire = true, roofH = h * 0.28, slit = true, sideWindows = 0 } = cfg;

      // Torre principal con ligera perspectiva
      const taper = w * 0.03;
      polyFill([
        [x - taper, baseY],
        [x - taper, baseY - h],
        [x + w + taper, baseY - h],
        [x + w + taper, baseY],
      ], '#000');

      drawCrenels(x - taper, baseY - h - 9, w + taper * 2, battlements, 9);

      if (spire) drawSpire(x - taper - w * 0.04, baseY - h - 9, w * 1.08, roofH, '#000');

      if (slit) {
        drawLancetWindow(
          x + w * 0.42,
          baseY - h * 0.56,
          Math.max(4, w * 0.14),
          Math.max(14, h * 0.2),
          r, g, b,
          layer === 1 ? 1 : 0.7,
          windowStates[Math.floor((x + w) % windowStates.length)]
        );
      }

      for (let i = 0; i < sideWindows; i++) {
        const lit = windowStates[Math.floor((x + i * 37) % windowStates.length)];
        drawWindowGlow(
          x + w * 0.16 + i * (w * 0.24),
          baseY - h * 0.26,
          Math.max(4, w * 0.09),
          Math.max(7, h * 0.09),
          r, g, b, 0.7, lit
        );
      }

      // Sombra lateral de la torre
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + w, baseY - h, taper, h);
    };

    const drawRearCastle = () => {
      const y = H * 0.6;
      // Castillos traseros con más detalle
      polyFill([
        [W * 0.2, y],
        [W * 0.2, y - 70],
        [W * 0.24, y - 70],
        [W * 0.24, y - 110],
        [W * 0.28, y - 110],
        [W * 0.28, y - 82],
        [W * 0.36, y - 82],
        [W * 0.36, y - 135],
        [W * 0.4, y - 135],
        [W * 0.4, y - 98],
        [W * 0.46, y - 98],
        [W * 0.46, y - 155],
        [W * 0.5, y - 155],
        [W * 0.5, y - 92],
        [W * 0.57, y - 92],
        [W * 0.57, y - 138],
        [W * 0.62, y - 138],
        [W * 0.62, y - 88],
        [W * 0.68, y - 88],
        [W * 0.68, y - 125],
        [W * 0.72, y - 125],
        [W * 0.72, y],
      ], 'rgba(0,0,0,0.65)');

      // Almenas traseras
      drawCrenels(W * 0.2, y - 78, W * 0.04, 2, 8);
      drawCrenels(W * 0.24, y - 118, W * 0.04, 2, 8);
      drawCrenels(W * 0.36, y - 143, W * 0.04, 2, 8);
      drawCrenels(W * 0.4, y - 106, W * 0.04, 2, 8);
      drawCrenels(W * 0.46, y - 163, W * 0.04, 2, 8);
      drawCrenels(W * 0.5, y - 100, W * 0.04, 2, 8);
      drawCrenels(W * 0.57, y - 146, W * 0.04, 2, 8);
      drawCrenels(W * 0.62, y - 96, W * 0.04, 2, 8);
      drawCrenels(W * 0.68, y - 133, W * 0.04, 2, 8);
    };

    const drawMainCastle = (r, g, b) => {
      const base = H * 0.65;
      const cx = W * 0.5;

      // Muralla principal con almenas detalladas
      polyFill([
        [cx - 320, base],
        [cx - 320, base - 42],
        [cx - 248, base - 42],
        [cx - 248, base - 86],
        [cx - 196, base - 86],
        [cx - 196, base - 60],
        [cx - 126, base - 60],
        [cx - 126, base - 100],
        [cx - 36, base - 100],
        [cx - 36, base - 138],
        [cx + 62, base - 138],
        [cx + 62, base - 96],
        [cx + 152, base - 96],
        [cx + 152, base - 56],
        [cx + 242, base - 56],
        [cx + 242, base - 82],
        [cx + 298, base - 82],
        [cx + 298, base - 38],
        [cx + 370, base - 38],
        [cx + 370, base],
      ], '#000');

      // Almenas
      drawCrenels(cx - 316, base - 52, 60, 3, 9);
      drawCrenels(cx - 244, base - 96, 46, 3, 9);
      drawCrenels(cx - 192, base - 68, 50, 3, 9);
      drawCrenels(cx - 122, base - 110, 70, 4, 9);
      drawCrenels(cx - 32, base - 148, 88, 5, 9);
      drawCrenels(cx + 66, base - 104, 82, 5, 9);
      drawCrenels(cx + 246, base - 90, 48, 3, 9);
      drawCrenels(cx + 302, base - 46, 62, 3, 9);

      // Keep central dominante
      drawTower({
        x: cx - 52,
        baseY: base - 100,
        w: 104,
        h: 185,
        battlements: 6,
        spire: true,
        roofH: 105,
        sideWindows: 3,
      }, r, g, b, 1);

      // Mega aguja trasera
      rect(cx - 12, base - 285, 24, 125, '#000');
      drawSpire(cx - 28, base - 285, 56, 128, '#000');
      rect(cx - 3, base - 428, 5, 24, '#000');
      // Bola en la punta
      ctx.beginPath();
      ctx.arc(cx, base - 430, 4, 0, TAU);
      ctx.fillStyle = '#000';
      ctx.fill();

      // Torres laterales
      drawTower({ x: cx - 188, baseY: base - 60, w: 62, h: 132, battlements: 4, spire: true, roofH: 78, sideWindows: 1 }, r, g, b, 1);
      drawTower({ x: cx + 118, baseY: base - 56, w: 58, h: 124, battlements: 4, spire: true, roofH: 74, sideWindows: 1 }, r, g, b, 1);
      drawTower({ x: cx - 302, baseY: base - 42, w: 52, h: 96, battlements: 3, spire: true, roofH: 56, slit: false, sideWindows: 1 }, r, g, b, 1);
      drawTower({ x: cx + 316, baseY: base - 38, w: 44, h: 138, battlements: 3, spire: true, roofH: 90, slit: false, sideWindows: 0 }, r, g, b, 1);

      // Torres traseras
      drawTower({ x: cx - 104, baseY: base - 124, w: 34, h: 72, battlements: 3, spire: true, roofH: 44, slit: false, sideWindows: 0 }, r, g, b, 0);
      drawTower({ x: cx + 76, baseY: base - 122, w: 30, h: 76, battlements: 3, spire: true, roofH: 48, slit: false, sideWindows: 0 }, r, g, b, 0);

      // Contrafuertes
      polyFill([[cx - 248, base], [cx - 226, base], [cx - 212, base - 38], [cx - 232, base - 38]], '#000');
      polyFill([[cx + 192, base], [cx + 214, base], [cx + 204, base - 36], [cx + 184, base - 36]], '#000');

      // Portón con arco y cadena
      ctx.beginPath();
      ctx.moveTo(cx - 32, base);
      ctx.lineTo(cx - 32, base - 42);
      ctx.quadraticCurveTo(cx, base - 78, cx + 32, base - 42);
      ctx.lineTo(cx + 32, base);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,15,25,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Cadena del portón
      ctx.strokeStyle = 'rgba(30,25,35,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 18, base - 35);
      for (let i = 0; i < 6; i++) {
        const yy = base - 35 + i * 6;
        ctx.lineTo(cx - 18 + Math.sin(i * 1.2) * 2, yy);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 18, base - 35);
      for (let i = 0; i < 6; i++) {
        const yy = base - 35 + i * 6;
        ctx.lineTo(cx + 18 + Math.sin(i * 1.2 + 0.5) * 2, yy);
      }
      ctx.stroke();

      // Glow del portón
      const gateGlow = ctx.createRadialGradient(cx, base - 22, 0, cx, base - 22, 72);
      gateGlow.addColorStop(0, `rgba(${Math.min(r + 125, 255)},${Math.min(g + 75, 255)},${Math.min(b + 22, 255)},0.28)`);
      gateGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = gateGlow;
      ctx.fillRect(cx - 78, base - 105, 156, 115);

      // Puente levadizo
      polyFill([
        [cx - 58, base],
        [cx + 46, base],
        [cx + 28, base + 22],
        [cx - 68, base + 22],
      ], '#010001');

      // Ventanas de la muralla
      const wallWindows = [
        [cx - 278, base - 56, 5, 8],
        [cx - 162, base - 82, 5, 10],
        [cx - 138, base - 82, 5, 10],
        [cx - 18, base - 182, 7, 16],
        [cx + 18, base - 182, 7, 16],
        [cx + 128, base - 80, 5, 9],
        [cx + 146, base - 80, 5, 9],
        [cx + 328, base - 58, 4, 8],
      ];
      for (let i = 0; i < wallWindows.length; i++) {
        const [wx, wy, ww, wh] = wallWindows[i];
        drawWindowGlow(wx, wy, ww, wh, r, g, b, 0.8, windowStates[i % windowStates.length]);
      }
    };

    const drawForegroundSpikes = () => {
      const y = H * 0.86;
      ctx.fillStyle = '#000';
      for (let x = -25; x < W + 35; x += 28) {
        const h = 20 + Math.sin(x * 0.038) * 9 + Math.random() * 8;
        polyFill([
          [x, y],
          [x + 9, y - h],
          [x + 18, y],
        ], '#000');
      }

      // Cruces con detalle
      const crosses = [
        [W * 0.15, H * 0.8, 20],
        [W * 0.86, H * 0.78, 18],
      ];
      crosses.forEach(([x, y, s]) => {
        rect(x - 1.5, y - s, 3, s * 1.3, '#000');
        rect(x - s * 0.4, y - s * 0.5, s * 0.8, 3, '#000');
        // Base de la cruz
        rect(x - s * 0.25, y + 2, s * 0.5, 4, '#000');
      });
    };

    const drawFog = (r, g, b) => {
      for (const f of fogLayers) {
        f.x += f.sp * (0.8 + f.layer * 0.3);
        if (f.x > W + f.w) f.x = -f.w;

        const alpha = f.a * (0.65 + Math.sin(t * 0.006 + f.ph) * 0.35);
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.w * 0.85);
        grad.addColorStop(0, `rgba(${Math.round(r * 0.18)},${Math.round(g * 0.06)},${Math.round(b * 0.2)},${alpha})`);
        grad.addColorStop(0.6, `rgba(${Math.round(r * 0.08)},${Math.round(g * 0.03)},${Math.round(b * 0.1)},${alpha * 0.5})`);
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(
          f.x + Math.sin(t * 0.0025 + f.ph) * 22,
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
        e.x += e.vx + Math.sin(t * 0.025 + e.ph) * 0.1;
        e.y += e.vy;
        if (e.y < H * 0.55 || e.x < -12 || e.x > W + 12) {
          e.x = Math.random() * W;
          e.y = H * rand(0.72, 0.95);
        }
        const a = e.a * (0.6 + Math.sin(t * 0.045 + e.ph) * 0.4);
        const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 7);
        glow.addColorStop(0, `rgba(${Math.min(r + 145, 255)},${Math.min(g + 65, 255)},${Math.min(b + 28, 255)},${a})`);
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 7, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawRain = () => {
      ctx.strokeStyle = 'rgba(140,150,170,0.08)';
      ctx.lineWidth = 0.8;
      for (const d of rainDrops) {
        d.y += d.sp;
        d.x -= 0.5;
        if (d.y > H + 20) { d.y = -20; d.x = Math.random() * W; }
        if (d.x < -10) d.x = W + 10;
        ctx.globalAlpha = d.a;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 3, d.y + d.len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const drawBat = (bat, r, g, b) => {
      // IA de vuelo más orgánica
      bat.turnTimer--;
      if (bat.turnTimer <= 0) {
        bat.targetX = rand(0, W);
        bat.targetY = rand(H * 0.12, H * 0.38);
        bat.turnTimer = rand(80, 200);
      }
      const dx = bat.targetX - bat.x;
      const dy = bat.targetY - bat.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        bat.x += (dx / dist) * bat.sp * 0.5;
        bat.y += (dy / dist) * bat.sp * 0.3 + bat.vy;
      }

      const flap = Math.sin(t * bat.flap * 60 + bat.ph);
      const s = bat.size * bat.depth;
      ctx.save();
      ctx.translate(bat.x, bat.y);
      const dir = dx >= 0 ? 1 : -1;
      ctx.scale(dir, 1);
      ctx.fillStyle = `rgba(${Math.max(0, Math.round(r * 0.06))},${Math.max(0, Math.round(g * 0.02))},${Math.max(0, Math.round(b * 0.08))},0.88)`;

      [-1, 1].forEach(side => {
        const wingAngle = flap * 0.52 * side;
        ctx.save();
        ctx.rotate(wingAngle * 0.32);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(side * s * 0.48, -s * 0.52, side * s * 1.02, -s * 0.14, side * s * 0.88, s * 0.12);
        ctx.bezierCurveTo(side * s * 0.62, s * 0.22, side * s * 0.24, s * 0.06, 0, 0);
        ctx.fill();
        ctx.restore();
      });

      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.24, s * 0.16, 0, 0, TAU);
      ctx.fill();

      // Cabeza con orejas
      ctx.beginPath();
      ctx.ellipse(s * 0.2, -s * 0.06, s * 0.12, s * 0.1, -0.18, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.14, -s * 0.14);
      ctx.lineTo(s * 0.12, -s * 0.26);
      ctx.lineTo(s * 0.2, -s * 0.16);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.22, -s * 0.14);
      ctx.lineTo(s * 0.28, -s * 0.28);
      ctx.lineTo(s * 0.3, -s * 0.16);
      ctx.fill();

      // Ojos rojos brillantes
      ctx.fillStyle = `rgba(${Math.min(r + 180, 255)},${Math.round(g * 0.3)},${Math.round(b * 0.2)},0.9)`;
      ctx.beginPath();
      ctx.arc(s * 0.24, -s * 0.08, 1.2, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s * 0.32, -s * 0.08, 1.2, 0, TAU);
      ctx.fill();

      ctx.restore();
    };

    const triggerLightning = () => {
      lightningCooldown--;
      if (lightning || lightningCooldown > 0) return;
      if (Math.random() < 0.008) {
        const branches = [];
        const build = (x, y, dx, maxY, depth) => {
          const pts = [[x, y]];
          let cx = x, cy = y;
          while (cy < maxY) {
            cx += dx + (Math.random() - 0.5) * 38;
            cy += rand(14, 26);
            pts.push([cx, cy]);
            if (depth > 0 && Math.random() > 0.6) {
              build(cx, cy, rand(-18, 18), cy + rand(45, 95), depth - 1);
            }
          }
          branches.push({ pts, width: depth === 2 ? 2.4 : depth === 1 ? 1.6 : 1.1, alpha: depth === 2 ? 1 : 0.52 });
        };
        build(W * rand(0.2, 0.8), 0, 0, H * rand(0.35, 0.52), 2);
        lightning = { branches, flash: 1 };
        lightningCooldown = Math.floor(rand(140, 300));
      }
    };

    const drawLightning = (r, g, b) => {
      if (!lightning) return;

      ctx.save();
      ctx.globalAlpha = lightning.flash * 0.15;
      ctx.fillStyle = `rgb(${Math.min(r + 125, 255)},${Math.min(g + 95, 255)},${Math.min(b + 140, 255)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      for (const branch of lightning.branches) {
        ctx.save();
        ctx.globalAlpha = lightning.flash * branch.alpha;
        ctx.strokeStyle = `rgb(${Math.min(r + 145, 255)},${Math.min(g + 125, 255)},255)`;
        ctx.lineWidth = branch.width;
        ctx.shadowColor = `rgba(${Math.min(r + 85, 255)},${Math.min(g + 65, 255)},255,1)`;
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.moveTo(branch.pts[0][0], branch.pts[0][1]);
        for (let i = 1; i < branch.pts.length; i++) ctx.lineTo(branch.pts[i][0], branch.pts[i][1]);
        ctx.stroke();
        ctx.restore();
      }

      lightning.flash -= 0.065;
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
      drawRain();
      drawLightning(r, g, b);
      triggerLightning();

      for (const bat of bats) {
        bat.x += bat.sp * bat.dir;
        bat.y += bat.vy + Math.sin(t * 0.016 + bat.ph) * 0.22;
        if (bat.x > W + 65) bat.x = -65;
        if (bat.x < -65) bat.x = W + 65;
        bat.y = Math.max(25, Math.min(H * 0.46, bat.y));
        drawBat(bat, r, g, b);
      }

      drawForegroundSpikes();
      drawEmbers(r, g, b);

      // Viñeta dramática
      const vignette = ctx.createRadialGradient(W * 0.5, H * 0.44, 0, W * 0.5, H * 0.48, Math.max(W, H) * 0.82);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(0.6, 'rgba(0,0,0,0.08)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.42)');
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
