const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano } from '../lib.js';

const TAU = Math.PI * 2;

export class Blood extends Component {
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
    let W = 0, H = 0, t = 0, waves, cells, drips;

    const resize = () => {
      W = canvas.width = canvas.offsetWidth || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    const makeWave = () => ({
      y: Math.random() * H,
      amp: 14 + Math.random() * 28,
      speed: .18 + Math.random() * .28,
      alpha: .035 + Math.random() * .07,
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
      alpha: .22 + Math.random() * .52,
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
      alpha: .10 + Math.random() * .20,
    });

    const init = () => {
      resize();
      const liviano = esDispositivoLiviano();
      waves = Array.from({ length: liviano ? 6 : 12 }, makeWave);
      cells = Array.from({ length: liviano ? 45 : 180 }, makeCell);
      drips = Array.from({ length: liviano ? 6 : 18 }, makeDrip);
    };

    const drawWave = (i, r, g, b) => {
      const w = waves[i];
      const y = w.y + Math.sin(t * w.speed + w.phase) * 24;
      const amp = w.amp + Math.sin(t * w.speed * .7 + w.phase) * 8;
      const band = 38 + (i % 4) * 18;
      const grad = ctx.createLinearGradient(0, y - band, 0, y + band);
      grad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      grad.addColorStop(.5, `rgba(${r},${g},${b},${w.alpha})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
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
      grad.addColorStop(0, `rgba(${r},${Math.max(0, Math.round(g * .45))},${b},0)`);
      grad.addColorStop(.25, `rgba(${r},${Math.max(0, Math.round(g * .45))},${b},${d.alpha * .45})`);
      grad.addColorStop(.72, `rgba(${r},${Math.max(0, Math.round(g * .45))},${b},${d.alpha})`);
      grad.addColorStop(1, `rgba(${r},${Math.max(0, Math.round(g * .45))},${b},0)`);
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
      glow.addColorStop(0, `rgba(${r},${g},${b},${c.alpha * .32})`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, c.r * 5, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const cell = ctx.createRadialGradient(-c.r * .25, -c.r * .25, 0, 0, 0, c.r * 1.4);
      cell.addColorStop(0, `rgba(${Math.min(255, r + 80)},${Math.min(255, g + 40)},${Math.min(255, b + 60)},${c.alpha * .9})`);
      cell.addColorStop(.55, `rgba(${r},${g},${b},${c.alpha * .72})`);
      cell.addColorStop(1, `rgba(${Math.max(0, Math.round(r * .35))},${Math.max(0, Math.round(g * .35))},${Math.max(0, Math.round(b * .35))},${c.alpha * .88})`);
      ctx.fillStyle = cell;
      ctx.beginPath();
      ctx.ellipse(0, 0, c.r * 1.45, c.r * .72, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    const draw = () => {
      const raf = requestAnimationFrame(draw);
      t += .012;
      const [r, g, b] = this.accent.rgb ?? [127, 0, 0];
      const dark = [Math.max(0, Math.round(r * .10)), Math.max(0, Math.round(g * .05)), Math.max(0, Math.round(b * .08))];
      const mid = [Math.max(0, Math.round(r * .34)), Math.max(0, Math.round(g * .12)), Math.max(0, Math.round(b * .22))];

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, `rgb(${dark[0]},${dark[1]},${dark[2]})`);
      bg.addColorStop(.45, `rgb(${mid[0]},${mid[1]},${mid[2]})`);
      bg.addColorStop(1, `rgb(${Math.max(0, Math.round(r * .18))},${Math.max(0, Math.round(g * .06))},${Math.max(0, Math.round(b * .12))})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      ctx.globalCompositeOperation = 'screen';
      waves.forEach((_, i) => drawWave(i, r, g, b));
      ctx.globalCompositeOperation = 'source-over';

      for (const d of drips) drawDrip(d, r, g, b);
      for (const c of cells) drawCell(c, r, g, b);

      ctx.globalCompositeOperation = 'screen';
      const vignette = ctx.createRadialGradient(W * .5, H * .5, 0, W * .5, H * .5, Math.max(W, H) * .72);
      vignette.addColorStop(0, `rgba(${r},${g},${b},.08)`);
      vignette.addColorStop(.62, `rgba(${r},${g},${b},.025)`);
      vignette.addColorStop(1, `rgba(0,0,0,.34)`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      this._raf = raf;
    };

    init();
    draw();
    this._ro = new ResizeObserver(() => { init(); });
    this._ro.observe(canvas);
    this._stop = () => { cancelAnimationFrame(this._raf); this._ro.disconnect(); };
  }

  componentWillUnmount() {
    this._stop?.();
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#050000;will-change:transform" />`;
  }
}
