const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano } from '../lib.js';

// Glitch — pantalla rota con artefactos digitales y scanlines.
export class Glitch extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#06b6d4');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, frame = 0;

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };

    const drawScanlines = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      const paso = esDispositivoLiviano() ? 10 : 4;
      for (let y = 0; y < H; y += paso) {
        ctx.fillRect(0, y, W, 2);
      }
    };

    const drawGlitchBands = () => {
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [6, 182, 212];
      const numBands = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < numBands; i++) {
        const y      = Math.random() * H;
        const height = 1 + Math.random() * 8;
        const alpha  = 0.15 + Math.random() * 0.25;
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${alpha})`;
        ctx.fillRect(0, y, W, height);

        // franja blanca de glitch (sin getImageData)
        if (Math.random() > 0.7) {
          const sliceH = 1 + Math.random() * 4;
          const sliceY = Math.random() * H;
          const sliceW = 20 + Math.random() * 120;
          const sliceX = Math.random() * (W - sliceW);
          ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.08})`;
          ctx.fillRect(sliceX, sliceY, sliceW, sliceH);
        }
      }
    };

    const drawNoise = () => {
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [6, 182, 212];
      const pixels = Math.floor(W * H * (esDispositivoLiviano() ? 0.0005 : 0.002));
      for (let i = 0; i < pixels; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const a = Math.random() * 0.6;
        ctx.fillStyle = `rgba(${ar},${ag},${ab},${a})`;
        ctx.fillRect(x, y, 1 + Math.random() * 2, 1);
      }
    };

    const draw = () => {
      frame++;
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [6, 182, 212];
      ctx.fillStyle = `rgba(${Math.round(ar*0.008)},${Math.round(ag*0.01)},${Math.round(ab*0.012)},0.92)`;
      ctx.fillRect(0, 0, W, H);

      drawScanlines();
      drawNoise();

      // glitch cada ~20 frames o aleatoriamente
      if (frame % 20 === 0 || Math.random() > 0.94) {
        drawGlitchBands();
      }

      // línea horizontal que recorre la pantalla
      const lineY = (frame * 1.2) % H;
      ctx.fillStyle = `rgba(${ar},${ag},${ab},0.06)`;
      ctx.fillRect(0, lineY, W, 2);

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
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1;background:#010204;will-change:transform"/>`;
  }
}
