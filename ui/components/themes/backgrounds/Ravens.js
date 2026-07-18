const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

const TAU = Math.PI * 2;

// Ravens — noche de luna, agujas góticas, ramas secas y una bandada de
// cuervos con siluetas más orgánicas. El acento del tema tiñe luna y niebla.
export class Ravens extends Component {
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
    let ravens = [], mist = [], stars = [];
    const light = esDispositivoLiviano();

    const makeRaven = (foreground = false) => ({
      x: Math.random() * Math.max(W, 800),
      y: H * (.08 + Math.random() * .5),
      z: foreground ? .9 + Math.random() * .35 : .25 + Math.random() * .65,
      speed: foreground ? .62 + Math.random() * .65 : .22 + Math.random() * .55,
      dir: Math.random() > .5 ? 1 : -1,
      phase: Math.random() * TAU,
      flap: .035 + Math.random() * .055,
      drift: (Math.random() - .5) * .13,
      alpha: foreground ? .9 : .42 + Math.random() * .42,
      foreground,
    });

    const rebuild = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
      const count = light ? 7 : 16;
      ravens = Array.from({ length: count }, (_, i) => makeRaven(i < (light ? 1 : 3)));
      mist = Array.from({ length: light ? 4 : 8 }, (_, i) => ({
        x: Math.random() * W,
        y: H * (.48 + i * .055),
        w: 180 + Math.random() * 360,
        h: 24 + Math.random() * 55,
        speed: .05 + Math.random() * .12,
        phase: Math.random() * TAU,
        alpha: .018 + Math.random() * .04,
      }));
      stars = Array.from({ length: light ? 45 : 130 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H * .62,
        r: .25 + Math.random() * 1.05,
        phase: Math.random() * TAU,
      }));
    };

    const drawMoon = (r, g, b) => {
      const mx = W * .76;
      const my = H * .18;
      const mr = Math.max(44, Math.min(92, Math.min(W, H) * .105));

      const halo = ctx.createRadialGradient(mx, my, mr * .2, mx, my, mr * 3.3);
      halo.addColorStop(0, `rgba(${Math.min(255, r + 160)},${Math.min(255, g + 130)},${Math.min(255, b + 145)},.21)`);
      halo.addColorStop(.28, `rgba(${r},${g},${b},.095)`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 3.3, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.shadowColor = `rgba(${r},${g},${b},.46)`;
      ctx.shadowBlur = 34;
      const moon = ctx.createRadialGradient(mx - mr * .28, my - mr * .3, mr * .06, mx, my, mr);
      moon.addColorStop(0, `rgba(${Math.min(255, r + 205)},${Math.min(255, g + 190)},${Math.min(255, b + 200)},.96)`);
      moon.addColorStop(.55, `rgba(${Math.min(255, r + 120)},${Math.min(255, g + 104)},${Math.min(255, b + 125)},.88)`);
      moon.addColorStop(1, `rgba(${Math.max(8, Math.round(r * .22))},${Math.max(6, Math.round(g * .13))},${Math.max(10, Math.round(b * .24))},.92)`);
      ctx.fillStyle = moon;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = .16;
      ctx.fillStyle = '#150914';
      [[-.28,-.08,.14],[.18,-.24,.1],[.26,.22,.16],[-.18,.3,.08],[-.05,-.34,.06]].forEach(([ox, oy, rr]) => {
        ctx.beginPath();
        ctx.ellipse(mx + ox * mr, my + oy * mr, rr * mr, rr * mr * .72, -.35, 0, TAU);
        ctx.fill();
      });
      ctx.restore();
    };

    const drawSpire = (x, base, width, height) => {
      ctx.beginPath();
      ctx.moveTo(x - width * .5, base);
      ctx.lineTo(x - width * .42, base - height * .58);
      ctx.lineTo(x - width * .12, base - height * .58);
      ctx.lineTo(x, base - height);
      ctx.lineTo(x + width * .12, base - height * .58);
      ctx.lineTo(x + width * .42, base - height * .58);
      ctx.lineTo(x + width * .5, base);
      ctx.closePath();
      ctx.fill();
    };

    const drawHorizon = (r, g, b) => {
      const base = H * .72;
      const hill = ctx.createLinearGradient(0, base - 90, 0, H);
      hill.addColorStop(0, `rgba(${Math.round(r * .06)},${Math.round(g * .025)},${Math.round(b * .07)},.9)`);
      hill.addColorStop(1, '#010001');
      ctx.fillStyle = hill;
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, base + 25);
      for (let x = 0; x <= W; x += Math.max(28, W / 24)) {
        const y = base + Math.sin(x * .014) * 17 + Math.sin(x * .031 + 1.7) * 8;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(0,0,0,.95)';
      const cx = W * .34;
      drawSpire(cx, base + 4, Math.max(54, W * .065), Math.max(145, H * .31));
      drawSpire(cx - W * .065, base + 8, Math.max(38, W * .042), Math.max(92, H * .19));
      drawSpire(cx + W * .068, base + 8, Math.max(40, W * .044), Math.max(105, H * .22));
      ctx.fillRect(cx - W * .09, base - H * .08, W * .18, H * .1);

      ctx.fillStyle = `rgba(${Math.min(255, r + 70)},${Math.min(255, g + 30)},${Math.min(255, b + 40)},.26)`;
      const winY = base - H * .14;
      [-W * .058, 0, W * .058].forEach((dx, i) => {
        ctx.beginPath();
        ctx.arc(cx + dx, winY + (i ? 13 : 0), 2.2, Math.PI, 0);
        ctx.rect(cx + dx - 2.2, winY + (i ? 13 : 0), 4.4, 8);
        ctx.fill();
      });
    };

    const branch = (x, y, len, angle, depth, side) => {
      if (depth <= 0 || len < 7) return;
      const ex = x + Math.cos(angle) * len;
      const ey = y + Math.sin(angle) * len;
      ctx.lineWidth = Math.max(.55, depth * .72);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(angle + side * .08) * len * .52,
        y + Math.sin(angle + side * .08) * len * .52,
        ex, ey,
      );
      ctx.stroke();
      branch(ex, ey, len * .67, angle - .34 * side, depth - 1, side);
      branch(ex, ey, len * .55, angle + .5 * side, depth - 1, -side);
    };

    const drawBranches = (r, g, b) => {
      ctx.save();
      ctx.strokeStyle = `rgba(${Math.max(2, Math.round(r * .045))},${Math.max(1, Math.round(g * .018))},${Math.max(3, Math.round(b * .055))},.94)`;
      ctx.shadowColor = `rgba(${r},${g},${b},.08)`;
      ctx.shadowBlur = 8;
      branch(-8, H * .86, Math.min(W, H) * .23, -1.12, 5, 1);
      branch(W + 8, H * .64, Math.min(W, H) * .2, -2.08, 5, -1);
      branch(W * .04, -6, Math.min(W, H) * .14, .88, 4, 1);
      ctx.restore();
    };

    const drawRaven = (bird) => {
      const s = (bird.foreground ? 19 : 11) * bird.z;
      const flap = Math.sin(t * bird.flap * 60 + bird.phase);
      const wingLift = flap * s * .34;

      ctx.save();
      ctx.translate(bird.x, bird.y);
      ctx.scale(bird.dir, 1);
      ctx.globalAlpha = bird.alpha;
      ctx.fillStyle = bird.foreground ? '#000' : 'rgba(0,0,0,.96)';
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = bird.foreground ? 8 : 3;

      ctx.beginPath();
      ctx.moveTo(-s * .05, 0);
      ctx.bezierCurveTo(-s * .42, -s * .35 - wingLift, -s * 1.15, -s * .56 - wingLift, -s * 1.5, -s * .12);
      ctx.bezierCurveTo(-s * 1.12, -s * .16, -s * .9, s * .02, -s * .62, s * .12);
      ctx.bezierCurveTo(-s * .34, s * .13, -s * .17, s * .06, -.02 * s, 0);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(s * .05, 0);
      ctx.bezierCurveTo(s * .38, -s * .34 + wingLift, s * 1.05, -s * .52 + wingLift, s * 1.4, -s * .08);
      ctx.bezierCurveTo(s * 1.03, -s * .14, s * .79, s * .04, s * .54, s * .14);
      ctx.bezierCurveTo(s * .29, s * .14, s * .14, s * .06, .02 * s, 0);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(0, 0, s * .47, s * .19, -.04, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s * .39, -s * .07, s * .17, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * .53, -s * .07);
      ctx.lineTo(s * .82, -s * .025);
      ctx.lineTo(s * .52, s * .05);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * .38, 0);
      ctx.lineTo(-s * .72, -s * .13);
      ctx.lineTo(-s * .57, s * .06);
      ctx.lineTo(-s * .72, s * .2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };

    const drawMist = (r, g, b) => {
      for (const f of mist) {
        f.x += f.speed;
        if (f.x - f.w > W) f.x = -f.w;
        const a = f.alpha * (.7 + Math.sin(t * .008 + f.phase) * .3);
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.w);
        grad.addColorStop(0, `rgba(${Math.min(255, r + 45)},${Math.min(255, g + 35)},${Math.min(255, b + 55)},${a})`);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, f.w, f.h, 0, 0, TAU);
        ctx.fill();
      }
    };

    const draw = () => {
      t++;
      const [r, g, b] = this.accent.rgb ?? [127, 0, 0];

      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, `rgb(${Math.max(1, Math.round(r * .012))},${Math.max(0, Math.round(g * .005))},${Math.max(3, Math.round(b * .018))})`);
      sky.addColorStop(.55, `rgb(${Math.max(3, Math.round(r * .035))},${Math.max(1, Math.round(g * .012))},${Math.max(5, Math.round(b * .045))})`);
      sky.addColorStop(1, '#010001');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      for (const s of stars) {
        const a = .18 + (.5 + Math.sin(t * .018 + s.phase) * .5) * .38;
        ctx.fillStyle = `rgba(${Math.min(255, r + 165)},${Math.min(255, g + 150)},${Math.min(255, b + 175)},${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      }

      drawMoon(r, g, b);
      drawHorizon(r, g, b);
      drawMist(r, g, b);
      drawBranches(r, g, b);

      ravens.sort((a, b2) => a.z - b2.z);
      for (const bird of ravens) {
        bird.x += bird.speed * bird.dir * bird.z;
        bird.y += bird.drift + Math.sin(t * .012 + bird.phase) * .12;
        if (bird.x > W + 110) { bird.x = -110; bird.y = H * (.08 + Math.random() * .52); }
        if (bird.x < -110) { bird.x = W + 110; bird.y = H * (.08 + Math.random() * .52); }
        drawRaven(bird);
      }

      const vignette = ctx.createRadialGradient(W * .52, H * .43, Math.min(W, H) * .08, W * .5, H * .5, Math.max(W, H) * .72);
      vignette.addColorStop(.5, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,.48)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      this._raf = sceneFrame(draw);
    };

    rebuild();
    draw();
    this._ro = new ResizeObserver(rebuild);
    this._ro.observe(canvas);
  }

  componentWillUnmount() {
    cancelSceneFrame(this._raf);
    this._ro?.disconnect();
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#010001;will-change:transform" />`;
  }
}
