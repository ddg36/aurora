const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano, fitCanvas, sceneFrame, cancelSceneFrame} from '../lib.js';

// Sakura — pétalos de cerezo con tilt 3D, ramas, bruma y luz difusa.
export class Sakura extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#f472b6');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, petals, branches, t = 0;

    // Rama fractal — dibuja un árbol de cerezo en la esquina
    function drawBranch(ctx, x, y, angle, length, depth, r, g, b) {
      if (depth === 0 || length < 2) return;
      const ex = x + Math.cos(angle) * length;
      const ey = y + Math.sin(angle) * length;
      const alpha = 0.08 + depth * 0.04;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.strokeStyle = `rgba(${Math.round(r*0.35)},${Math.round(g*0.15)},${Math.round(b*0.25)},${alpha})`;
      ctx.lineWidth = depth * 0.8;
      ctx.stroke();
      const spread = 0.35 + Math.random() * 0.1;
      drawBranch(ctx, ex, ey, angle - spread, length * 0.68, depth - 1, r, g, b);
      drawBranch(ctx, ex, ey, angle + spread, length * 0.65, depth - 1, r, g, b);
      if (depth > 2) drawBranch(ctx, ex, ey, angle - 0.1, length * 0.55, depth - 2, r, g, b);
    }

    const makePetal = (full) => ({
      x:        Math.random() * (W || window.innerWidth),
      y:        full ? Math.random() * (H || window.innerHeight) : -20 - Math.random() * 200,
      size:     2.5 + Math.random() * 5.5,
      speedY:   0.4 + Math.random() * 0.9,
      speedX:   (Math.random() - 0.5) * 0.4,
      rotZ:     Math.random() * Math.PI * 2,
      rotZSpd:  (Math.random() - 0.5) * 0.035,
      tiltX:    Math.random() * Math.PI * 2,
      tiltXSpd: 0.018 + Math.random() * 0.025,
      swing:    (Math.random() - 0.5) * 0.025,
      phase:    Math.random() * Math.PI * 2,
      alpha:    0.45 + Math.random() * 0.45,
    });

    const resize = () => {
      const size = fitCanvas(canvas, ctx);
      W = size.width;
      H = size.height;
    };

    const init = () => {
      resize();
      petals   = Array.from({ length: esDispositivoLiviano() ? 22 : 70 }, (_, i) => makePetal(i < (esDispositivoLiviano() ? 15 : 50)));
      branches = null; // se dibuja en primer frame con color correcto
    };

    // Cache del canvas de ramas para no redibujar cada frame
    let branchCanvas = null, branchKey = '';

    const ensureBranches = (r, g, b) => {
      const key = `${r},${g},${b},${W},${H}`;
      if (branchKey === key && branchCanvas) return branchCanvas;
      branchCanvas = document.createElement('canvas');
      branchCanvas.width = W; branchCanvas.height = H;
      const bctx = branchCanvas.getContext('2d');
      bctx.lineCap = 'round';
      // árbol izquierdo (esquina inferior izquierda)
      drawBranch(bctx, W * 0.08, H * 1.02, -Math.PI / 2 - 0.15, H * 0.28, 7, r, g, b);
      // árbol derecho (esquina superior derecha, colgando)
      drawBranch(bctx, W * 0.92, -H * 0.02, Math.PI / 2 + 0.2, H * 0.2, 6, r, g, b);
      branchKey = key;
      return branchCanvas;
    };

    const drawPetal = (p, r, g, b) => {
      const scaleX  = Math.cos(p.tiltX);
      const absScale = Math.abs(scaleX);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotZ);
      ctx.scale(scaleX, 1);

      // forma de pétalo de cerezo (5 lóbulos suaves)
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo( s*0.9, -s*0.4,  s*0.9,  s*0.5,  0,  s);
      ctx.bezierCurveTo(-s*0.9,  s*0.5, -s*0.9, -s*0.4,  0, -s);

      const bright = Math.round(30 + absScale * 60);
      const grad = ctx.createRadialGradient(-s*0.2, -s*0.3, 0, 0, 0, s * 1.1);
      grad.addColorStop(0,   `rgba(${Math.min(r+bright+30,255)},${Math.min(g+bright+20,255)},${Math.min(b+bright,255)},${p.alpha})`);
      grad.addColorStop(0.5, `rgba(${Math.min(r+bright,255)},${Math.min(g+bright*0.5,255)},${b},${p.alpha * 0.8})`);
      grad.addColorStop(1,   `rgba(${r},${Math.round(g*0.7)},${Math.round(b*0.8)},${p.alpha * 0.3})`);
      ctx.fillStyle = grad;
      ctx.fill();

      // vena central sutil
      if (absScale > 0.4) {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.7);
        ctx.lineTo(0,  s * 0.7);
        ctx.strokeStyle = `rgba(${Math.min(r+50,255)},${g},${b},${p.alpha * 0.25})`;
        ctx.lineWidth = 0.4;
        ctx.stroke();
      }
      ctx.restore();
    };

    let raf;
    const draw = () => {
      raf = sceneFrame(draw);
      t++;
      const [r, g, b] = this.accent.rgb ?? [244, 114, 182];

      // fondo — noche de jardín japonés
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0,   `rgb(${Math.max(3,Math.round(r*0.04))},${Math.max(1,Math.round(g*0.015))},${Math.max(5,Math.round(b*0.05))})`);
      bg.addColorStop(0.5, `rgb(${Math.max(6,Math.round(r*0.08))},${Math.max(2,Math.round(g*0.022))},${Math.max(7,Math.round(b*0.07))})`);
      bg.addColorStop(1,   `rgb(${Math.max(2,Math.round(r*0.03))},${Math.max(1,Math.round(g*0.01))},${Math.max(4,Math.round(b*0.04))})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // luna difusa arriba centro-derecha
      const mx = W * 0.72, my = H * 0.12, mr = 40;
      const moonG = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 3);
      moonG.addColorStop(0,   `rgba(${Math.min(r+150,255)},${Math.min(g+130,255)},${Math.min(b+120,255)},0.55)`);
      moonG.addColorStop(0.25,`rgba(${Math.min(r+80,255)},${Math.min(g+70,255)},${Math.min(b+70,255)},0.2)`);
      moonG.addColorStop(1,   'transparent');
      ctx.shadowColor = `rgba(${r},${g},${b},0.25)`;
      ctx.shadowBlur  = 30;
      ctx.fillStyle   = moonG;
      ctx.beginPath(); ctx.arc(mx, my, mr * 3, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur  = 0;

      // ramas (cacheadas)
      ctx.drawImage(ensureBranches(r, g, b), 0, 0);

      // niebla en capas
      for (let i = 0; i < 3; i++) {
        const fy    = H * (0.35 + i * 0.22) + Math.sin(t * 0.004 + i * 1.8) * 18;
        const fgrad = ctx.createLinearGradient(0, fy - 55, 0, fy + 55);
        fgrad.addColorStop(0,   'transparent');
        fgrad.addColorStop(0.5, `rgba(${r},${Math.round(g*0.6)},${b},0.03)`);
        fgrad.addColorStop(1,   'transparent');
        ctx.fillStyle = fgrad;
        ctx.fillRect(0, fy - 55, W, 110);
      }

      // pétalos
      for (const p of petals) {
        drawPetal(p, r, g, b);
        p.y     += p.speedY;
        p.x     += p.speedX + Math.sin(t * 0.018 + p.phase) * 0.5;
        p.rotZ  += p.rotZSpd;
        p.tiltX += p.tiltXSpd;
        if (p.y > H + 20) Object.assign(p, makePetal(false));
        if (p.x >  W + 20) p.x = -20;
        if (p.x < -20)     p.x =  W + 20;
      }
    };

    init();
    draw();
    this._ro = new ResizeObserver(() => { resize(); branchKey = ''; });
    this._ro.observe(canvas);
    this._stop = () => { cancelSceneFrame(raf); this._ro.disconnect(); };
  }

  componentWillUnmount() { this._stop?.(); this.accent.stop(); }

  render() {
    return html`<canvas ref=${this.canvasRef} style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;" />`;
  }
}
