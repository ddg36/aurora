const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { readThemeColors } from '../lib.js';

const TAU = Math.PI * 2;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const rgb = ([r, g, b], a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const rgba = (c, a) => rgb(c, a);
const lift = ([r, g, b], n = 120) => [clamp(r + n, 0, 255), clamp(g + n, 0, 255), clamp(b + n, 0, 255)];
const darken = ([r, g, b], n = 80) => [clamp(r - n, 0, 255), clamp(g - n, 0, 255), clamp(b - n, 0, 255)];
const mix = (a, b, t) => a.map((v, i) => clamp(v + (b[i] - v) * t, 0, 255));
const rand = (a, b) => a + Math.random() * (b - a);

function cloudLobe(ctx, x, y, rx, ry, color, alpha, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(-rx * .22, -ry * .34, 0, 0, 0, Math.max(rx, ry) * 1.08);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(.52, rgba(color, alpha * .48));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function cloud(ctx, x, y, w, h, theme, alpha, t, phase) {
  const accent = theme.accent;
  const edge = theme.edge;
  const edgeDim = theme.edgeDim;
  const scale = Math.min(w / 320, h / 90);
  const drift = Math.sin(t * .35 + phase) * 10;
  const baseY = h * .58;

  ctx.save();
  ctx.translate(x + drift, y);
  ctx.scale(scale, scale);
  ctx.globalCompositeOperation = 'source-over';

  cloudLobe(ctx, -150, baseY + 20, 118, 28, edgeDim, alpha * .12, .04);
  cloudLobe(ctx, -58, baseY + 24, 146, 34, edgeDim, alpha * .15, -.03);
  cloudLobe(ctx, 70, baseY + 22, 126, 30, edgeDim, alpha * .12, .02);

  const body = ctx.createLinearGradient(0, -64, 0, baseY + 34);
  body.addColorStop(0, rgba(mix(edgeDim, [255, 255, 255], .66), alpha * .20));
  body.addColorStop(.45, rgba(edgeDim, alpha * .16));
  body.addColorStop(1, rgba(edge, alpha * .08));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-176, baseY + 12);
  ctx.bezierCurveTo(-168, baseY - 24, -132, baseY - 44, -104, baseY - 30);
  ctx.bezierCurveTo(-104, baseY - 66, -54, -74, -26, baseY - 42);
  ctx.bezierCurveTo(-8, -78, 48, -78, 68, baseY - 38);
  ctx.bezierCurveTo(98, -62, 150, -44, 178, baseY - 12);
  ctx.bezierCurveTo(204, baseY + 20, 148, baseY + 44, 80, baseY + 36);
  ctx.bezierCurveTo(8, baseY + 46, -122, baseY + 42, -176, baseY + 12);
  ctx.fill();

  cloudLobe(ctx, -126, 10, 58, 38, edgeDim, alpha * .20, -.08);
  cloudLobe(ctx, -76, -8, 72, 54, edgeDim, alpha * .24, .05);
  cloudLobe(ctx, -18, -18, 86, 64, edgeDim, alpha * .30, -.02);
  cloudLobe(ctx, 50, -8, 78, 58, edgeDim, alpha * .25, .04);
  cloudLobe(ctx, 118, 8, 62, 40, edgeDim, alpha * .20, -.06);

  cloudLobe(ctx, -154, 18, 58, 16, mix(edgeDim, [255, 255, 255], .45), alpha * .08, .03);
  cloudLobe(ctx, 136, 18, 54, 15, mix(edgeDim, [255, 255, 255], .45), alpha * .08, -.03);
  cloudLobe(ctx, -96, -24, 42, 24, [255, 255, 255], alpha * .18, .05);
  cloudLobe(ctx, -26, -28, 96, 38, mix(edgeDim, [255, 255, 255], .70), alpha * .24, .01);
  cloudLobe(ctx, 52, -26, 72, 30, mix(edge, [255, 255, 255], .62), alpha * .16, -.02);
  cloudLobe(ctx, 104, -16, 48, 26, mix(accent, [255, 255, 255], .45), alpha * .09, -.04);

  for (let i = 0; i < 9; i++) {
    const px = -150 + i * 32;
    const py = baseY - 10 + Math.sin(t * .45 + phase + i * .8) * 4;
    const a = alpha * (.035 + (i % 3) * .012);
    cloudLobe(ctx, px, py, 28 + (i % 3) * 14, 8 + (i % 4) * 3, mix(edgeDim, [255, 255, 255], .58), a, (i % 2 ? 1 : -1) * .09);
  }

  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(-18, -12, 0, -18, -12, 220);
  glow.addColorStop(0, rgba(accent, alpha * .12));
  glow.addColorStop(.42, rgba(accent, alpha * .045));
  glow.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.ellipse(-18, -12, 220, 82, 0, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function smokePuff(ctx, x, y, rx, ry, color, alpha, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(-rx * .2, -ry * .25, 0, 0, 0, Math.max(rx, ry));
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(.5, rgba(mix(color, [255, 255, 255], .65), alpha * .45));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSmoke(ctx, W, H, t, theme, alpha) {
  const accent = theme.accent;
  const edge = theme.edge;
  const edgeDim = theme.edgeDim;

  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, rgba(mix(edgeDim, [255, 255, 255], .86), .92));
  base.addColorStop(.48, rgba(mix(edgeDim, [255, 255, 255], .94), .96));
  base.addColorStop(1, rgba(edgeDim, .78));
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 13; i++) {
    const layer = i % 4;
    const x = ((i * 270 + t * (9 + layer * 4)) % (W + 700)) - 350;
    const y = H * (.08 + (i % 4) * .24) + Math.sin(t * .28 + i) * 32;
    const w = W * (.34 + layer * .08) + Math.sin(t * .18 + i) * W * .035;
    const h = H * (.18 + (i % 3) * .055);
    const sway = Math.sin(t * .45 + i * .7) * 24;
    smokePuff(ctx, x + sway, y, w, h, edgeDim, alpha * (.055 + layer * .018), Math.sin(t * .25 + i) * .10);
    smokePuff(ctx, x + w * .34, y - h * .16, w * .58, h * .48, mix(edgeDim, [255, 255, 255], .76), alpha * (.045 + layer * .014), -Math.sin(t * .32 + i) * .08);
    smokePuff(ctx, x - w * .22, y + h * .08, w * .42, h * .36, edge, alpha * (.025 + layer * .008), Math.sin(t * .22 + i) * .06);
  }

  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(W * .5, H * .72, 0, W * .5, H * .72, Math.max(W, H) * .72);
  glow.addColorStop(0, rgba(accent, alpha * .12));
  glow.addColorStop(.45, rgba(edgeDim, alpha * .035));
  glow.addColorStop(1, rgba(edgeDim, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

function drawDust(ctx, items, t, W, H, color, opts = {}) {
  const speed = opts.speed ?? 1;
  for (const p of items) {
    p.p += p.s * speed;
    p.x += p.vx * speed + Math.sin(p.p) * .08;
    p.y += p.vy * speed + Math.cos(p.p) * .05;
    if (p.x < -30) p.x = W + 30;
    if (p.x > W + 30) p.x = -30;
    if (p.y < -30) p.y = H + 30;
    if (p.y > H + 30) p.y = -30;
    const pulse = (opts.warm ?? true) ? .55 + .45 * Math.sin(p.p) : .35 + .65 * Math.abs(Math.sin(p.p));
    ctx.fillStyle = rgb(color, p.a * pulse);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    if (opts.glow) {
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 10);
      glow.addColorStop(0, rgb(color, p.a * pulse * .28));
      glow.addColorStop(1, rgb(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 10, 0, TAU);
      ctx.fill();
    }
  }
}

function drawParticles(ctx, items, W, H, dist, color, alpha = .45) {
  for (const p of items) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0 || p.x > W) p.vx *= -1;
    if (p.y < 0 || p.y > H) p.vy *= -1;
    ctx.fillStyle = rgb(color, .72);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const dx = items[i].x - items[j].x;
      const dy = items[i].y - items[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < dist) {
        const a = (1 - d / dist) * alpha;
        ctx.strokeStyle = rgb(color, a);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(items[i].x, items[i].y);
        ctx.lineTo(items[j].x, items[j].y);
        ctx.stroke();
      }
    }
  }
}

function drawAuroraCurtains(ctx, W, H, t, color) {
  const [r, g, b] = color;
  const bands = 14;
  for (let i = 0; i < bands; i++) {
    const x = (i / (bands - 1)) * W + Math.sin(t * 1.5 + i * .7) * 32;
    const top = H * (.02 + (i % 3) * .012);
    const bottom = H * (.72 + Math.sin(t + i) * .05);
    const w = W * (.035 + (i % 4) * .012);
    const grad = ctx.createLinearGradient(x, top, x + w, bottom);
    grad.addColorStop(0, rgba(mix(color, [255, 255, 255], .55), .30));
    grad.addColorStop(.22, rgba(color, .20));
    grad.addColorStop(.5, rgba(mix(color, [255, 255, 255], .25), .10));
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - w * .55, top);
    for (let y = top; y <= bottom; y += 16) {
      const k = (y - top) / (bottom - top);
      const drift = Math.sin(y * .018 + t * 3.2 + i * .55) * w * (.45 + k * .65);
      ctx.lineTo(x + drift, y);
    }
    for (let y = bottom; y >= top; y -= 16) {
      const k = (y - top) / (bottom - top);
      const drift = Math.sin(y * .018 + t * 3.2 + i * .55) * w * (.45 + k * .65);
      ctx.lineTo(x + w * .8 + drift, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(color, .18);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    const rays = 7;
    for (let j = 0; j <= rays; j++) {
      const k = j / rays;
      const y = top + k * (bottom - top);
      const x2 = x + Math.sin(y * .02 + t * 4 + i) * w * .45 + k * w * .55;
      if (j === 0) ctx.moveTo(x2, y); else ctx.lineTo(x2, y);
    }
    ctx.stroke();
  }
}

class LightBackground extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.items = [];
    this.extra = [];
    this.variant = props.variant || 'particles';
  }

  componentDidMount() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, t = 0;
    const variant = this.variant;

    const makeItem = () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: rand(.6, 3.4),
      a: rand(.12, .52),
      vx: rand(-.22, .22),
      vy: rand(-.22, .22),
      p: Math.random() * TAU,
      s: rand(.003, .02),
    });

    const makeLeaf = () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: rand(3, 9),
      rot: Math.random() * TAU,
      rotSpd: rand(-.035, .035),
      vx: rand(.2, 1.3),
      vy: rand(.15, .75),
      swing: rand(.4, 1.2),
      phase: Math.random() * TAU,
      hue: Math.random(),
      alpha: rand(.45, .9),
    });

    const makeSnow = () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: rand(.6, 2.8),
      vx: rand(.2, 1.8),
      vy: rand(.3, 1.5),
      phase: Math.random() * TAU,
      alpha: rand(.25, .8),
    });

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      const density = Math.max(80, Math.min(260, Math.round((W * H) / 14500)));
      this.items = Array.from({ length: density }, makeItem);
      this.extra = Array.from({ length: Math.round(density * .45) }, variant === 'autumn' || variant === 'sakura' ? makeLeaf : makeSnow);
    };

    const bg = (a, b, c) => {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, a);
      g.addColorStop(.48, b);
      g.addColorStop(1, c);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };

    const grid = (step, color, drift = 0) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      for (let x = ((t * drift) % step) - step; x < W; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = ((t * drift * .6) % step) - step; y < H; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    };

    const draw = () => {
      t += .01;
      const theme = readThemeColors();
      const accent = theme.accent;
      const edge = theme.edge;
      const edgeDim = theme.edgeDim;
      const pale = lift(accent, 218);
      const deep = darken(accent, 60);
      const dustColor = variant === 'fireflies' ? mix(accent, [255, 235, 180], .45) : pale;

      if (variant === 'clouds') {
        bg('#ffffff', '#ffffff', '#ffffff');
        for (let i = 0; i < 13; i++) {
          const layer = i % 4;
          const speed = 7 + layer * 3.2;
          const x = ((i * 285 + t * speed) % (W + 640)) - 320;
          const y = H * (.09 + (i % 5) * .145) + Math.sin(t * .45 + i) * 12;
          const w = 305 + layer * 78 + Math.sin(t * .2 + i) * 22;
          const h = 82 + (i % 3) * 24;
          const alpha = .16 + layer * .032 + (i % 2) * .014;
          cloud(ctx, x, y, w, h, theme, alpha, t, i);
        }
      } else if (variant === 'starfield') {
        bg('#ffffff', '#ffffff', '#ffffff');
        for (const s of this.items) {
          s.p += s.s * .55;
          s.x += s.vx * .55 + Math.sin(s.p) * .08;
          s.y += s.vy * .55 + Math.cos(s.p) * .05;
          if (s.x < -30) s.x = W + 30;
          if (s.x > W + 30) s.x = -30;
          if (s.y < -30) s.y = H + 30;
          if (s.y > H + 30) s.y = -30;
          const pulse = .45 + .55 * Math.sin(s.p);
          const alpha = s.a * pulse;
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 14);
          glow.addColorStop(0, rgba(accent, alpha * .52));
          glow.addColorStop(.35, rgba(edge, alpha * .22));
          glow.addColorStop(1, rgba(edge, 0));
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 14, 0, TAU);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = rgba([0, 0, 0], alpha * .95);
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, TAU);
          ctx.fill();
        }
      } else if (variant === 'void') {
        bg('#ffffff', '#fbfcff', '#ffffff');
        const cx = W * .5, cy = H * .5;
        const rr = Math.min(W, H) * .28;
        const hole = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        hole.addColorStop(0, 'rgba(255,255,255,1)');
        hole.addColorStop(.22, rgba(mix(edge, [255, 255, 255], .72), .82));
        hole.addColorStop(.55, rgba(edge, .22));
        hole.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hole;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = rgba(edge, .22);
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, rr * (.65 + i * .18), rr * (.18 + i * .05), t * .15 + i, 0, TAU);
          ctx.stroke();
        }
        drawDust(ctx, this.items, t, W, H, edge, { glow: true, speed: .9 });
      } else if (variant === 'nebula') {
        bg('#ffffff', rgba(pale, .85), '#ffffff');
        const cx = W * .5, cy = H * .42;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * .62);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(.12, rgba(mix(edge, [255, 255, 255], .65), .58));
        g.addColorStop(.36, rgba(mix(edgeDim, [255, 255, 255], .55), .24));
        g.addColorStop(.62, rgba(edge, .12));
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 16; i++) {
          const a = i / 16 * TAU + t * .05;
          ctx.strokeStyle = i % 2 ? rgba(edge, .18) : rgba(mix(edgeDim, [255, 255, 255], .45), .18);
          ctx.lineWidth = 1 + (i % 3);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.bezierCurveTo(cx + Math.cos(a) * 120, cy + Math.sin(a) * 90, cx + Math.cos(a + .5) * 290, cy + Math.sin(a + .5) * 210, cx + Math.cos(a) * W * .46, cy + Math.sin(a) * H * .34);
          ctx.stroke();
        }
        ctx.restore();
        drawDust(ctx, this.items, t, W, H, edge, { glow: true, speed: .65 });
      } else if (variant === 'aurora') {
        bg('#ffffff', rgba(pale, .72), '#ffffff');
        drawAuroraCurtains(ctx, W, H, t, edge);
      } else if (variant === 'particles') {
        bg('#ffffff', rgba(pale, .70), '#ffffff');
        drawParticles(ctx, this.items, W, H, Math.min(160, Math.max(95, W / 12)), edge, .28);
      } else if (variant === 'matrix') {
        bg('#ffffff', rgba(mix(edge, [255, 255, 255], .88), .72), '#ffffff');
        ctx.font = '13px Consolas, monospace';
        const chars = '01アイウ{}<>/=░▒▓';
        for (let x = 0; x < W; x += 30) {
          const yOff = (t * 34 + x * 1.4) % (H + 80);
          for (let y = -80; y < H; y += 38) {
            if ((x + y) % 5 !== 0) continue;
            const yy = (y + yOff) % (H + 80) - 40;
            ctx.fillStyle = rgba(edgeDim, .18);
            ctx.fillText(chars[(x + y + Math.floor(t * 8)) % chars.length], x, yy);
          }
        }
      } else if (variant === 'grid') {
        bg('#ffffff', '#f8fbff', '#ffffff');
        grid(42, rgba(edge, .16), 8);
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.fillRect(0, 0, W, H);
      } else if (variant === 'rain') {
        bg('#ffffff', rgba(mix(edge, [255, 255, 255], .92), .82), '#ffffff');
        for (const d of this.items) {
          d.y += d.r * 1.6 + .8;
          if (d.y > H + 40) { d.y = -40; d.x = Math.random() * W; }
          ctx.strokeStyle = rgba(edge, .10 + d.a * .18);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + 4, d.y + 28);
          ctx.stroke();
        }
      } else if (variant === 'glitch') {
        bg('#ffffff', '#fbfcff', '#ffffff');
        for (let i = 0; i < 26; i++) {
          const w = 40 + Math.random() * 220;
          const h = 2 + Math.random() * 10;
          const x = Math.random() * (W - w);
          const y = Math.random() * H;
          const c = i % 3 === 0 ? mix(edge, [255, 255, 255], .25) : i % 3 === 1 ? mix(edgeDim, [255, 255, 255], .45) : edge;
          ctx.fillStyle = rgba(c, i % 3 === 0 ? .06 : .045);
          ctx.fillRect(x, y, w, h);
        }
        ctx.fillStyle = rgba(edgeDim, .025);
        for (let y = 0; y < H; y += 5) ctx.fillRect(0, y, W, 1);
      } else if (variant === 'fireflies') {
        bg('#ffffff', rgba(mix(accent, [255, 255, 255], .92), .85), '#ffffff');
        for (const f of this.items) {
          f.angle = (f.angle || 0) + f.s * .2;
          f.x = (f.x || Math.random() * W) + Math.cos(f.angle) * .08;
          f.y = (f.y || Math.random() * H) + Math.sin(f.angle) * .08;
          if (f.x < 0 || f.x > W) f.x = Math.random() * W;
          if (f.y < 0 || f.y > H) f.y = Math.random() * H;
          const pulse = .5 + .5 * Math.sin(t * 3 + f.p);
          const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 12);
          glow.addColorStop(0, rgba(mix(accent, [255, 255, 255], .55), .12 + pulse * .18));
          glow.addColorStop(1, rgba(accent, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 12, 0, TAU);
          ctx.fill();
          ctx.fillStyle = rgba(mix(accent, [255, 255, 255], .55), .35 + pulse * .4);
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, TAU);
          ctx.fill();
        }
      } else if (variant === 'castle') {
        bg('#ffffff', rgba(pale, .72), '#ffffff');
        const sun = ctx.createRadialGradient(W * .78, H * .18, 0, W * .78, H * .18, Math.min(W, H) * .45);
        sun.addColorStop(0, rgba(mix(accent, [255, 255, 255], .70), .48));
        sun.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = sun;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = rgba(deep, .18);
        ctx.beginPath();
        ctx.moveTo(0, H * .72);
        for (let x = 0; x <= W; x += 24) ctx.lineTo(x, H * (.7 + Math.sin(x * .01 + t) * .025));
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = rgba(deep, .28);
        const base = H * .72;
        const cx = W * .5;
        ctx.fillRect(cx - W * .24, base - H * .12, W * .48, H * .12);
        ctx.fillRect(cx - W * .18, base - H * .22, W * .36, H * .1);
        ctx.fillRect(cx - W * .06, base - H * .32, W * .12, H * .2);
        for (let i = -3; i <= 3; i++) ctx.fillRect(cx + i * W * .04 - W * .015, base - H * .35, W * .03, H * .035);
      } else if (variant === 'ash') {
        const bloodTheme = document.documentElement.dataset.tema === 'blood' || document.body.dataset.tema === 'blood';
        bg('#ffffff', bloodTheme ? rgba(edgeDim, .22) : '#ffffff', '#ffffff');
        const ashColor = bloodTheme ? edge : accent;
        drawSmoke(ctx, W, H, t, theme, bloodTheme ? .58 : .82);

        for (const p of this.items) {
          p.p += p.s * .45;
          p.x += p.vx * .45 + Math.sin(p.p * 1.7) * .08;
          p.y += (p.vy + .18) * .45;
          if (p.x < -40) p.x = W + 40;
          if (p.x > W + 40) p.x = -40;
          if (p.y > H + 50) { p.y = -50; p.x = Math.random() * W; }
          const pulse = .58 + .42 * Math.abs(Math.sin(p.p));
          const x = p.x + Math.sin(t * 1.6 + p.p) * 10;
          const y = p.y + Math.cos(t * 1.1 + p.p) * 5;
          const alpha = p.a * pulse;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = rgba(ashColor, alpha * .86);
          ctx.beginPath();
          ctx.ellipse(x, y, p.r * 1.6, p.r * .62, p.p, 0, TAU);
          ctx.fill();
          ctx.fillStyle = rgba(mix(accent, [255, 255, 255], .48), alpha * .32);
          ctx.beginPath();
          ctx.arc(x - p.r * .25, y - p.r * .12, p.r * .35, 0, TAU);
          ctx.fill();
        }
      } else if (variant === 'fog') {
        bg('#ffffff', rgba(pale, .70), '#ffffff');
        for (let i = 0; i < 8; i++) {
          const x = ((i * 230 + t * (18 + i)) % (W + 420)) - 210;
          const y = H * (.18 + (i % 5) * .14);
          cloud(ctx, x, y, 220 + i * 18, 58 + i * 5, theme, .18, t, i);
        }
        drawDust(ctx, this.items, t, W, H, edgeDim, { speed: .45 });
      } else if (variant === 'ravens') {
        bg('#ffffff', rgba(mix(accent, [255, 255, 255], .82), .58), '#ffffff');
        ctx.fillStyle = rgba(mix(accent, [255, 255, 255], .70), .35);
        ctx.beginPath();
        ctx.arc(W * .78, H * .18, Math.min(W, H) * .12, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = rgba(deep, .22);
        ctx.lineWidth = 2;
        for (let i = 0; i < 16; i++) {
          const x = ((i * 91 + t * 22) % (W + 120)) - 60;
          const y = H * (.16 + (i % 7) * .07) + Math.sin(t + i) * 10;
          const s = 5 + (i % 3) * 2;
          ctx.beginPath();
          ctx.moveTo(x - s * 3, y);
          ctx.quadraticCurveTo(x - s, y - s * 3, x, y);
          ctx.quadraticCurveTo(x + s, y - s * 3, x + s * 3, y);
          ctx.stroke();
        }
      } else if (variant === 'abyss' || variant === 'depths') {
        bg('#ffffff', rgba(mix(edge, [255, 255, 255], .88), .42), '#ffffff');
        ctx.strokeStyle = rgba(edge, .16);
        ctx.lineWidth = 1.2;
        for (let y = 0; y < H; y += 34) {
          ctx.beginPath();
          for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + Math.sin(x * .02 + t + y * .01) * 10);
          ctx.stroke();
        }
        for (const p of this.items) {
          p.y -= .18;
          if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; }
          ctx.fillStyle = rgba(edge, .22);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
        }
      } else if (variant === 'lava') {
        bg('#ffffff', rgba(mix(edgeDim, [255, 255, 255], .82), .62), '#ffffff');
        for (let i = 0; i < 10; i++) {
          cloud(ctx, W * (i / 9), H * (.78 + Math.sin(t + i) * .04), 130 + i * 16, 34 + i * 3, theme, .12, t, i);
        }
        ctx.strokeStyle = rgba(edgeDim, .16);
        ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const y = H * (.42 + i * .08) + Math.sin(t + i) * 12;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 24) ctx.lineTo(x, y + Math.sin(x * .015 + t * 2 + i) * 8);
          ctx.stroke();
        }
      } else if (variant === 'sakura' || variant === 'autumn') {
        bg('#ffffff', rgba(mix(accent, [255, 255, 255], .92), .82), '#ffffff');
        for (const p of this.extra) {
          p.y += p.vy;
          p.x += p.vx + Math.sin(t * p.swing + p.phase) * .35;
          p.rot += p.rotSpd;
          if (p.x > W + 30 || p.y > H + 20) { p.x = -30; p.y = Math.random() * H; }
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const petal = variant === 'sakura' ? mix(accent, [255, 255, 255], .25) : mix(edgeDim, [255, 220, 170], .35);
          ctx.fillStyle = rgba(petal, p.alpha);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * .55, p.size, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      } else if (variant === 'moonlit') {
        bg('#ffffff', rgba(mix(accent, [255, 255, 255], .90), .72), '#ffffff');
        cloud(ctx, W * .72, H * .2, W * .22, H * .1, theme, .28, t, 0);
        for (const l of this.items) {
          l.y += l.vy;
          if (l.y > H + 20) { l.y = -20; l.x = Math.random() * W; }
          const glow = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 36);
          glow.addColorStop(0, rgba(mix(accent, [255, 255, 255], .55), .20));
          glow.addColorStop(1, rgba(accent, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(l.x, l.y, 36, 0, TAU);
          ctx.fill();
          ctx.fillStyle = rgba(mix(accent, [255, 255, 255], .35), .45);
          ctx.beginPath();
          ctx.arc(l.x, l.y, 3, 0, TAU);
          ctx.fill();
        }
      } else if (variant === 'blizzard' || variant === 'tundra') {
        bg('#ffffff', rgba(mix(edge, [255, 255, 255], .92), .78), '#ffffff');
        for (const f of this.items) {
          f.y += f.vy;
          f.x += f.vx + Math.sin(t + f.p) * .4;
          if (f.y > H + 10 || f.x > W + 10) { f.y = -10; f.x = Math.random() * W; }
          ctx.fillStyle = rgba(edge, f.a);
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = rgba(edgeDim, .10);
        ctx.beginPath();
        ctx.moveTo(0, H * .78);
        for (let x = 0; x <= W; x += 32) ctx.lineTo(x, H * .74 + Math.sin(x * .008 + t) * 34);
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fill();
      } else {
        bg('#ffffff', rgba(pale, .72), '#ffffff');
      }

      this._raf = requestAnimationFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    draw();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#fff;will-change:transform" />`;
  }
}

class LightHellfireCanvas extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.sprites = [];
    this.ready = false;
    this.variant = props.variant || 'hellfire';
  }

  componentDidMount() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, t = 0;
    let loaded = 0;
    for (let i = 0; i < 2; i++) {
      const img = new Image();
      img.src = `/ui/components/images/fire-sprite-${i}.png`;
      img.onload = () => { this.sprites[i] = img; if (++loaded === 2) this.ready = true; };
      img.onerror = () => { if (++loaded === 2) this.ready = true; };
    }

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const makeParticle = (full) => ({
      x: Math.random() * W,
      y: full ? H * (.7 + Math.random() * .3) : H + 10,
      size: 18 + Math.random() * 38,
      vy: -(0.6 + Math.random() * 1.8),
      vx: (Math.random() - 0.5) * 0.5,
      life: 1,
      decay: .008 + Math.random() * .01,
      s1: Math.random() * 10,
      s2: Math.random() * 10,
      sprite: Math.floor(Math.random() * 2),
      scaleX: .45 + Math.random() * .7,
      rot: (Math.random() - 0.5) * .5,
      rotSpd: (Math.random() - 0.5) * .04,
    });

    const makeBase = () => ({
      x: Math.random() * W,
      size: 95 + Math.random() * 84,
      sprite: Math.floor(Math.random() * 2),
      phase: Math.random() * TAU,
      phase2: Math.random() * TAU,
      speed: .015 + Math.random() * .012,
      scaleX: .4 + Math.random() * .5,
      baseAlpha: .14,
    });

    const makeEmber = (full) => ({
      x: Math.random() * W,
      y: full ? H * (.6 + Math.random() * .4) : H + 5,
      r: .8 + Math.random() * 2,
      vy: -(0.5 + Math.random() * 2.2),
      vx: (Math.random() - 0.5) * .6,
      life: 1,
      decay: .006 + Math.random() * .009,
      s1: Math.random() * 10,
      s2: Math.random() * 10,
      hot: Math.random() > .4,
    });

    let bases, particles, embers;
    const init = () => {
      resize();
      const n = Math.max(16, Math.min(30, Math.round(W / 70)));
      bases = Array.from({ length: n }, (_, i) => ({
        ...makeBase(),
        x: (W / n) * i + (W / n) * (.1 + Math.random() * .8),
      }));
      particles = Array.from({ length: 42 }, () => makeParticle(true));
      embers = Array.from({ length: 220 }, () => makeEmber(true));
    };

    let tintCache = { key: '', canvases: [] };
    const getTinted = (r, g, b) => {
      const key = `${r},${g},${b}`;
      if (tintCache.key === key) return tintCache.canvases;
      const out = this.sprites.map(spr => {
        if (!spr) return null;
        const oc = document.createElement('canvas');
        oc.width = spr.width;
        oc.height = spr.height;
        const oc2 = oc.getContext('2d');
        const grad = oc2.createLinearGradient(0, 0, 0, spr.height);
        grad.addColorStop(0, rgba(mix([r, g, b], [255, 255, 255], .62), .72));
        grad.addColorStop(.32, rgba(mix([r, g, b], [255, 255, 255], .35), .58));
        grad.addColorStop(.72, rgba([r, g, b], .52));
        grad.addColorStop(1, rgba(darken([r, g, b], 35), .42));
        oc2.fillStyle = grad;
        oc2.fillRect(0, 0, spr.width, spr.height);
        oc2.globalCompositeOperation = 'destination-in';
        oc2.drawImage(spr, 0, 0);
        return oc;
      });
      tintCache = { key, canvases: out };
      return out;
    };

    const draw = () => {
      const theme = readThemeColors();
      const [r, g, b] = theme.edge;
      const [dr, dg, db] = theme.edgeDim;
      t += .03;
      bgLight(ctx, W, H, theme);
      if (!this.ready) {
        this._raf = requestAnimationFrame(draw);
        return;
      }

      const tinted = getTinted(r, g, b);
      ctx.globalCompositeOperation = 'source-over';
      for (const f of bases) {
        const spr = tinted[f.sprite];
        if (!spr) continue;
        const wobble = Math.sin(t * f.speed + f.phase) * 12;
        const heightPulse = .75 + Math.sin(t * f.speed * 1.5 + f.phase2) * .25;
        const sw = f.size * f.scaleX;
        const sh = f.size * 1.45 * heightPulse;
        ctx.globalCompositeOperation = 'screen';
        const glow = ctx.createRadialGradient(f.x + wobble, H - sh * .55, 0, f.x + wobble, H - sh * .55, sh * .85);
        glow.addColorStop(0, theme.glow);
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(f.x + wobble - sh, H - sh * 1.35, sh * 2, sh * 1.35);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = f.baseAlpha;
        ctx.drawImage(spr, f.x + wobble - sw * .5, H - sh, sw, sh);
      }

      const ceilY = H * .92;
      for (const p of particles) {
        const windX = Math.sin(t * 1.3 + p.s1) + Math.sin(t * 3 + p.s2 + p.y * .009) * .5;
        p.vx += windX * .06;
        p.vx *= .93;
        p.vy = Math.max(p.vy - .01, -3);
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rotSpd;
        p.life -= p.decay;
        const fade = p.y < ceilY ? Math.max(0, (p.y - (ceilY - H * .08)) / (H * .08)) : 1;
        if (p.life <= 0 || fade <= 0 || p.x < -100 || p.x > W + 100) {
          Object.assign(p, makeParticle(false));
          continue;
        }
        const spr = tinted[p.sprite];
        if (!spr) continue;
        const alpha = Math.sin(p.life * Math.PI) * fade * .36;
        const sw = p.size * p.scaleX;
        const sh = p.size * 1.5;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const pg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sh * .8);
        pg.addColorStop(0, theme.glow);
        pg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = pg;
        ctx.fillRect(p.x - sh, p.y - sh, sh * 2, sh * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y - sh * .5);
        ctx.rotate(p.rot);
        ctx.drawImage(spr, -sw * .5, -sh * .5, sw, sh);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'screen';
      const eceil = H * .76;
      for (const e of embers) {
        const windX = Math.sin(t * 1.4 + e.s1) + Math.sin(t * 3.1 + e.s2 + e.y * .009) * .5;
        e.vx += windX * .06;
        e.vx *= .93;
        e.vy = Math.max(e.vy - .01, -3.2);
        e.x += e.vx;
        e.y += e.vy;
        e.life -= e.decay;
        const fade = e.y < eceil ? Math.max(0, (e.y - (eceil - H * .1)) / (H * .1)) : 1;
        if (e.life <= 0 || fade <= 0 || e.x < -40 || e.x > W + 40) {
          Object.assign(e, makeEmber(false));
          continue;
        }
        const lt = e.life;
        const alpha = Math.sin(lt * Math.PI) * fade * .95;
        const hot = e.hot && lt > .6 ? mix([r, g, b], [255, 255, 255], .55) : lt > .35 ? [r, g, b] : darken([r, g, b], 55);
        const eg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 10);
        eg.addColorStop(0, rgba(hot, alpha * .35));
        eg.addColorStop(1, rgba(hot, 0));
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r * 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba(hot, alpha);
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, TAU);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (this.variant === 'lava') {
        ctx.strokeStyle = rgba([dr, dg, db], .16);
        ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const y = H * (.42 + i * .08) + Math.sin(t + i) * 12;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 24) ctx.lineTo(x, y + Math.sin(x * .015 + t * 2 + i) * 8);
          ctx.stroke();
        }
      }
      this._raf = requestAnimationFrame(draw);
    };

    init();
    draw();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);
    this._stop = () => { cancelAnimationFrame(this._raf); this._ro.disconnect(); };
  }

  componentWillUnmount() {
    this._stop?.();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#fff;will-change:transform" />`;
  }
}

function bgLight(ctx, W, H, theme) {
  const accent = theme.accent;
  const edge = theme.edge;
  const edgeDim = theme.edgeDim;
  const pale = lift(accent, 218);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(.52, rgba(pale, .58));
  g.addColorStop(1, 'rgba(255,248,238,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const heat = ctx.createRadialGradient(W * .5, H, 0, W * .5, H, Math.max(W, H) * .62);
  heat.addColorStop(0, rgba(mix(edgeDim, [255, 255, 255], .45), .42));
  heat.addColorStop(.45, rgba(edgeDim, .18));
  heat.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = heat;
  ctx.fillRect(0, 0, W, H);
}

class LightBloodCanvas extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
  }

  componentDidMount() {
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, t = 0, waves, cells, drips;

    const resize = () => {
      W = canvas.width = canvas.offsetWidth || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    const makeWave = () => ({
      y: Math.random() * H,
      amp: 14 + Math.random() * 28,
      speed: .18 + Math.random() * .28,
      alpha: .045 + Math.random() * .075,
      phase: Math.random() * TAU,
      width: .008 + Math.random() * .012,
    });

    const makeCell = () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 1.4 + Math.random() * 4.8,
      vx: (Math.random() - .5) * .28,
      vy: .12 + Math.random() * .55,
      phase: Math.random() * TAU,
      alpha: .28 + Math.random() * .56,
      rot: Math.random() * TAU,
      rotSpeed: (Math.random() - .5) * .025,
    });

    const makeDrip = () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      len: 55 + Math.random() * 160,
      width: 1.2 + Math.random() * 4.8,
      speed: .22 + Math.random() * .55,
      phase: Math.random() * TAU,
      alpha: .12 + Math.random() * .22,
    });

    const init = () => {
      resize();
      waves = Array.from({ length: 12 }, makeWave);
      cells = Array.from({ length: 180 }, makeCell);
      drips = Array.from({ length: 18 }, makeDrip);
    };

    const drawWave = (i, r, g, b) => {
      const w = waves[i];
      const y = w.y + Math.sin(t * w.speed + w.phase) * 24;
      const amp = w.amp + Math.sin(t * w.speed * .7 + w.phase) * 8;
      const band = 38 + (i % 4) * 18;
      const grad = ctx.createLinearGradient(0, y - band, 0, y + band);
      grad.addColorStop(0, rgba([r, g, b], 0));
      grad.addColorStop(.5, rgba([r, g, b], w.alpha));
      grad.addColorStop(1, rgba([r, g, b], 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 18) {
        const yy = y + Math.sin(x * w.width + t * .8 + w.phase) * amp + Math.sin(x * .026 - t * .45 + i) * 10;
        if (x === 0) ctx.moveTo(x, yy - band * .5); else ctx.lineTo(x, yy - band * .5);
      }
      for (let x = W; x >= 0; x -= 18) {
        const yy = y + Math.sin(x * w.width + t * .8 + w.phase) * amp + Math.sin(x * .026 - t * .45 + i) * 10;
        ctx.lineTo(x, yy + band * .5);
      }
      ctx.closePath();
      ctx.fill();
    };

    const drawDrip = (d, r, g, b) => {
      d.y += d.speed;
      if (d.y - d.len > H + 20) {
        d.y = -d.len - Math.random() * 120;
        d.x = Math.random() * W;
        d.len = 55 + Math.random() * 160;
      }
      const x = d.x + Math.sin(t * 1.2 + d.phase) * 8;
      const sway = Math.sin(t * .8 + d.phase) * d.width * 2.2;
      const grad = ctx.createLinearGradient(x - d.width * 3, d.y - d.len, x + d.width * 3, d.y + d.len);
      grad.addColorStop(0, rgba([r, g, b], 0));
      grad.addColorStop(.25, rgba([r, g, b], d.alpha * .45));
      grad.addColorStop(.72, rgba([r, g, b], d.alpha));
      grad.addColorStop(1, rgba([r, g, b], 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - d.width, d.y - d.len);
      ctx.bezierCurveTo(x - d.width * 2 - sway, d.y - d.len * .55, x - d.width - sway, d.y - d.len * .18, x - d.width * .8, d.y);
      ctx.bezierCurveTo(x + d.width * .9, d.y + d.len * .22, x + d.width * 2 + sway, d.y + d.len * .62, x + d.width, d.y + d.len);
      ctx.bezierCurveTo(x - d.width, d.y + d.len * .78, x - d.width * 1.8, d.y + d.len * .35, x - d.width, d.y - d.len);
      ctx.fill();
    };

    const drawCell = (c, r, g, b) => {
      c.y += c.vy;
      c.x += c.vx + Math.sin(t * .7 + c.phase) * .08;
      c.rot += c.rotSpeed;
      if (c.y > H + 12) { c.y = -12; c.x = Math.random() * W; }
      if (c.x < -12) c.x = W + 12;
      if (c.x > W + 12) c.x = -12;
      const x = c.x + Math.sin(t * .5 + c.phase) * 4;
      const y = c.y + Math.cos(t * .45 + c.phase) * 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(c.rot);
      ctx.globalCompositeOperation = 'screen';
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, c.r * 5);
      glow.addColorStop(0, rgba([r, g, b], c.alpha * .32));
      glow.addColorStop(1, rgba([r, g, b], 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, c.r * 5, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const cell = ctx.createRadialGradient(-c.r * .25, -c.r * .25, 0, 0, 0, c.r * 1.4);
      cell.addColorStop(0, rgba(mix([r, g, b], [255, 255, 255], .35), c.alpha * .86));
      cell.addColorStop(.55, rgba([r, g, b], c.alpha * .72));
      cell.addColorStop(1, rgba(darken([r, g, b], 70), c.alpha * .88));
      ctx.fillStyle = cell;
      ctx.beginPath();
      ctx.ellipse(0, 0, c.r * 1.45, c.r * .72, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    const draw = () => {
      const theme = readThemeColors();
      const [r, g, b] = theme.edgeDim;
      const [ar, ag, ab] = theme.accent;
      t += .012;
      const dark = mix([r, g, b], [0, 0, 0], .62);
      const mid = mix([r, g, b], [0, 0, 0], .28);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, rgba(dark, 1));
      bg.addColorStop(.45, rgba(mid, 1));
      bg.addColorStop(1, rgba(mix([r, g, b], [0, 0, 0], .55), 1));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'screen';
      waves.forEach((_, i) => drawWave(i, ar, ag, ab));
      ctx.globalCompositeOperation = 'source-over';

      for (const d of drips) drawDrip(d, ar, ag, ab);
      for (const c of cells) drawCell(c, ar, ag, ab);

      ctx.globalCompositeOperation = 'screen';
      const vignette = ctx.createRadialGradient(W * .5, H * .5, 0, W * .5, H * .5, Math.max(W, H) * .72);
      vignette.addColorStop(0, rgba([ar, ag, ab], .08));
      vignette.addColorStop(.62, rgba([ar, ag, ab], .025));
      vignette.addColorStop(1, 'rgba(0,0,0,.34)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      this._raf = requestAnimationFrame(draw);
    };

    init();
    draw();
    this._ro = new ResizeObserver(() => { init(); });
    this._ro.observe(canvas);
    this._stop = () => { cancelAnimationFrame(this._raf); this._ro.disconnect(); };
  }

  componentWillUnmount() {
    this._stop?.();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#050000;will-change:transform" />`;
  }
}

const variantComponent = (variant) => function LightVariant() {
  return html`<${LightBackground} variant=${variant} />`;
};

export const LightClouds = variantComponent('clouds');
export const LightStarfield = variantComponent('starfield');
export const LightVoid = variantComponent('void');
export const LightNebula = variantComponent('nebula');
export const LightAurora = variantComponent('aurora');
export const LightParticles = variantComponent('particles');
export const LightMatrix = variantComponent('matrix');
export const LightGrid = variantComponent('grid');
export const LightRain = variantComponent('rain');
export const LightGlitch = variantComponent('glitch');
export const LightFireflies = variantComponent('fireflies');
export const LightCastle = variantComponent('castle');
export const LightAsh = variantComponent('ash');
export const LightFog = variantComponent('fog');
export const LightRavens = variantComponent('ravens');
export const LightAbyss = variantComponent('abyss');
export const LightDepths = variantComponent('depths');
export const LightHellfire = function LightHellfireVariant() {
  return html`<${LightHellfireCanvas} variant="hellfire" />`;
};
export const LightBlood = function LightBloodVariant() {
  return html`<${LightBloodCanvas} />`;
};
export const LightLava = function LightLavaVariant() {
  return html`<${LightHellfireCanvas} variant="lava" />`;
};
export const LightSakura = variantComponent('sakura');
export const LightAutumn = variantComponent('autumn');
export const LightMoonlit = variantComponent('moonlit');
export const LightBlizzard = variantComponent('blizzard');
export const LightTundra = variantComponent('tundra');
