const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

// Sonar — pulso de sonar submarino rotando en esquina. Temática abismal.
export class Sonar extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent    = createAccentWatcher('#06b6d4');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, t = 0;
    const pulses = []; // { age: 0..1 }

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    const SIZE  = 110; // radio del sonar
    const CX    = 60;  // centro desde borde izquierdo
    const CY_fn = () => H - 70; // cerca del borde inferior

    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t++;
      ctx.clearRect(0, 0, W, H);

      const [r, g, b] = this.accent.rgb ?? [6, 182, 212];
      const CY = CY_fn();

      // cada ~90 frames lanza un nuevo pulso
      if (t % 90 === 0) pulses.push({ age: 0 });
      for (const p of pulses) p.age += 1 / 90;
      pulses.splice(0, pulses.findIndex(p => p.age < 1));

      // fondo oscuro del sonar
      ctx.beginPath();
      ctx.arc(CX, CY, SIZE, 0, Math.PI * 2);
      const bg = ctx.createRadialGradient(CX, CY, 0, CX, CY, SIZE);
      bg.addColorStop(0, `rgba(0,15,20,0.85)`);
      bg.addColorStop(1, `rgba(0,5,8,0.6)`);
      ctx.fillStyle = bg;
      ctx.fill();

      // anillos de referencia
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(CX, CY, SIZE * i / 3, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.15)`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // cruces de referencia
      ctx.strokeStyle = `rgba(${r},${g},${b},0.12)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(CX - SIZE, CY); ctx.lineTo(CX + SIZE, CY);
      ctx.moveTo(CX, CY - SIZE); ctx.lineTo(CX, CY + SIZE);
      ctx.stroke();

      // borde exterior
      ctx.beginPath();
      ctx.arc(CX, CY, SIZE, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.4)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // línea giratoria (barrido)
      const angle = (t * 0.025) % (Math.PI * 2);
      const sweep = ctx.createConicalGradient ? null : null; // no disponible en todos los browsers
      // dibujamos el sector manualmente
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, SIZE - 2, angle - 1.2, angle);
      ctx.closePath();
      const sweepGrad = ctx.createLinearGradient(CX, CY, CX + Math.cos(angle) * SIZE, CY + Math.sin(angle) * SIZE);
      sweepGrad.addColorStop(0, `rgba(${r},${g},${b},0)`);
      sweepGrad.addColorStop(1, `rgba(${r},${g},${b},0.25)`);
      ctx.fillStyle = sweepGrad;
      ctx.fill();
      ctx.restore();

      // línea del barrido
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.lineTo(CX + Math.cos(angle) * (SIZE - 2), CY + Math.sin(angle) * (SIZE - 2));
      ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `rgba(${r},${g},${b},1)`;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // pulsos de ping expansivos
      for (const p of pulses) {
        const pr = SIZE * p.age;
        const alpha = (1 - p.age) * 0.5;
        ctx.beginPath();
        ctx.arc(CX, CY, pr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // clip circular para no salir del sonar
      // (canvas no tiene clip acumulativo fácil — los efectos quedan dentro por geometría)

      // punto central
      ctx.beginPath();
      ctx.arc(CX, CY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},0.9)`;
      ctx.shadowBlur = 6;
      ctx.shadowColor = `rgba(${r},${g},${b},1)`;
      ctx.fill();
      ctx.shadowBlur = 0;

      // etiqueta
      ctx.fillStyle = `rgba(${r},${g},${b},0.35)`;
      ctx.font = '8px monospace';
      ctx.fillText('SONAR', CX - 14, CY + SIZE + 12);
    };

    resize();
    draw();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);
    this._stop = () => { cancelAnimationFrame(raf); this._ro.disconnect(); };
  }

  componentWillUnmount() { this._stop?.(); this.accent.stop(); }

  render() {
    return html`<canvas ref=${this.canvasRef} style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10;" />`;
  }
}
