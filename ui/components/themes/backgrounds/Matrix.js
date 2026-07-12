const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher, esDispositivoLiviano } from '../lib.js';

// Matrix rain — caracteres cayendo estilo Matrix.
export class Matrix extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#22c55e');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789ABCDEFX<>[]{}|';
    const PASO = esDispositivoLiviano() ? 26 : 14;
    let W, H, cols, drops;

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      cols = Math.floor(W / PASO);
      drops = Array.from({ length: cols }, () => Math.random() * -50);
    };

    const draw = () => {
      const [ar, ag, ab] = this.accent.state?.rgb ?? this.accent.rgb ?? [34, 197, 94];
      ctx.fillStyle = `rgba(${Math.round(ar*0.004)},${Math.round(ag*0.006)},${Math.round(ab*0.004)},0.05)`;
      ctx.fillRect(0, 0, W, H);
      ctx.font = '13px monospace';

      for (let i = 0; i < cols; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const x = i * PASO;
        const y = drops[i] * PASO;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(char, x, y);
        if (drops[i] > 1) {
          ctx.fillStyle = this.accent.state.hex;
          ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], x, y - PASO);
        }
        drops[i]++;
        if (drops[i] * PASO > H && Math.random() > 0.975) drops[i] = 0;
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
    this.accent.stop();
  }

  render() {
    return html`<canvas ref=${this.canvasRef} class="fixed inset-0 w-full h-full pointer-events-none" style="z-index:-1; opacity:0.55; will-change:transform"/>`;
  }
}
