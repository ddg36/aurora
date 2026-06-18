const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Drip — gotas realistas que caen, se acumulan y forman charcos.
export class Drip extends Component {
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
    let W, H;
    let drips   = [];
    let puddles = []; // manchas acumuladas en el suelo

    const makeDrip = () => ({
      x:        20 + Math.random() * ((W || 800) - 40),
      y:        0,
      r:        2.5 + Math.random() * 3.5,
      speed:    0,
      accel:    0.06 + Math.random() * 0.04, // gravedad variable
      trail:    [],                            // puntos del rastro
      maxTrail: 18 + Math.floor(Math.random() * 20),
      alpha:    0.85 + Math.random() * 0.15,
      landed:   false,
      splashR:  0,
      splashA:  0,
    });

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const drawDrip = (d, ar, ag, ab) => {
      if (d.landed) return;

      // rastro (tallo)
      if (d.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(d.trail[0].x, d.trail[0].y);
        for (let i = 1; i < d.trail.length; i++) {
          const t = d.trail[i];
          ctx.lineTo(t.x, t.y);
        }
        const trailGrad = ctx.createLinearGradient(d.x, d.trail[0].y, d.x, d.y);
        trailGrad.addColorStop(0, `rgba(${ar},${ag},${ab},0)`);
        trailGrad.addColorStop(0.5, `rgba(${ar},${ag},${ab},${d.alpha * 0.4})`);
        trailGrad.addColorStop(1, `rgba(${ar},${ag},${ab},${d.alpha * 0.8})`);
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth   = d.r * 0.55;
        ctx.lineCap     = 'round';
        ctx.stroke();
      }

      // cuerpo de la gota (forma de lágrima)
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.beginPath();
      ctx.moveTo(0, -d.r * 1.4);
      ctx.bezierCurveTo( d.r * 0.8, -d.r * 0.4,  d.r, d.r * 0.5,  0, d.r * 1.2);
      ctx.bezierCurveTo(-d.r, d.r * 0.5, -d.r * 0.8, -d.r * 0.4, 0, -d.r * 1.4);

      const dropGrad = ctx.createRadialGradient(-d.r * 0.3, -d.r * 0.4, 0, 0, 0, d.r * 1.4);
      dropGrad.addColorStop(0,   `rgba(${Math.min(ar+80,255)},${Math.min(ag+60,255)},${Math.min(ab+60,255)},${d.alpha * 0.6})`);
      dropGrad.addColorStop(0.3, `rgba(${ar},${ag},${ab},${d.alpha})`);
      dropGrad.addColorStop(1,   `rgba(${Math.max(0,ar-40)},0,0,${d.alpha})`);
      ctx.fillStyle   = dropGrad;
      ctx.shadowColor = `rgba(${ar},${ag},${ab},0.7)`;
      ctx.shadowBlur  = 8;
      ctx.fill();
      ctx.restore();
    };

    const drawSplash = (d, ar, ag, ab) => {
      if (d.splashA <= 0) return;
      // anillo de impacto
      ctx.beginPath();
      ctx.arc(d.x, H - 1, d.splashR, Math.PI, 0);
      ctx.strokeStyle = `rgba(${ar},${ag},${ab},${d.splashA * 0.6})`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();

      // charco que queda
      ctx.beginPath();
      ctx.ellipse(d.x, H - 1, d.splashR * 0.8, d.splashR * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ar},${ag},${ab},${d.splashA * 0.3})`;
      ctx.fill();
    };

    const draw = () => {
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [139, 92, 246];
      ctx.clearRect(0, 0, W, H);

      // agregar nuevas gotas
      if (Math.random() > 0.985 && drips.length < 14) {
        drips.push(makeDrip());
      }

      // dibujar charcos acumulados
      for (const p of puddles) {
        p.alpha -= 0.0005;
        if (p.alpha <= 0) continue;
        ctx.beginPath();
        ctx.ellipse(p.x, H - 2, p.r, p.r * 0.18, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${p.alpha})`;
        ctx.fill();
      }
      puddles = puddles.filter(p => p.alpha > 0);

      for (const d of drips) {
        if (!d.landed) {
          d.speed += d.accel;
          d.y     += d.speed;

          d.trail.push({ x: d.x, y: d.y - d.r });
          if (d.trail.length > d.maxTrail) d.trail.shift();

          if (d.y + d.r >= H) {
            d.landed  = true;
            d.splashA = 0.9;
            d.splashR = d.r * 1.5;
            // dejar charco
            puddles.push({ x: d.x, r: d.r * 2.5 + Math.random() * 6, alpha: 0.5 });
          }
        } else {
          // splash animation
          d.splashR += 1.8;
          d.splashA -= 0.025;
        }

        drawDrip(d, ar, ag, ab);
        drawSplash(d, ar, ag, ab);
      }

      drips = drips.filter(d => !d.landed || d.splashA > 0);

      this._raf = requestAnimationFrame(draw);
    };

    this._resize = resize;
    window.addEventListener('resize', resize);
    resize();
    // seed inicial
    drips = Array.from({ length: 3 }, makeDrip);
    drips.forEach(d => { d.y = Math.random() * H * 0.6; });
    draw();
  }

  componentWillUnmount() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._resize);
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:10"/>`;
  }
}
