const { html } = globalThis;
const { Component, createRef } = globalThis.preact;
import { createAccentWatcher } from '../lib.js';

export class Hellfire extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.accent = createAccentWatcher('#f97316');
  }

  componentDidMount() {
    this.accent.start();
    const canvas = this.canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles, sprites = [], spritesReady = false, t = 0;

    let loaded = 0;
    for (let i = 0; i < 2; i++) {
      const img = new Image();
      img.src = `/ui/components/images/fire-sprite-${i}.png`;
      img.onload  = () => { sprites[i] = img; if (++loaded === 2) spritesReady = true; };
      img.onerror = () => { if (++loaded === 2) spritesReady = true; };
    }

    const makeParticle = (full) => ({
      x:      Math.random() * (W || window.innerWidth),
      y:      full
                ? (H || window.innerHeight) * (0.7 + Math.random() * 0.3)
                : (H || window.innerHeight) + 10,
      size:   18 + Math.random() * 38,
      vy:     -(0.6 + Math.random() * 1.8),
      vx:     (Math.random() - 0.5) * 0.5,
      life:   1.0,
      decay:  0.008 + Math.random() * 0.010,
      s1:     Math.random() * 10,
      s2:     Math.random() * 10,
      sprite: Math.floor(Math.random() * 2),
      scaleX: 0.45 + Math.random() * 0.7,
      rot:    (Math.random() - 0.5) * 0.5,   // rotación inicial
      rotSpd: (Math.random() - 0.5) * 0.04,  // velocidad de rotación
    });

    const resize = () => {
      W = canvas.width  = canvas.offsetWidth  || window.innerWidth;
      H = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    const makeBase = () => ({
      x:         Math.random() * (W || window.innerWidth),
      size:      95 + Math.random() * 84,
      sprite:    Math.floor(Math.random() * 2),
      phase:     Math.random() * Math.PI * 2,
      phase2:    Math.random() * Math.PI * 2,
      speed:     0.015 + Math.random() * 0.012,
      scaleX:    0.4 + Math.random() * 0.5,
      baseAlpha: 0.04,
    });

    const makeEmber = (full) => ({
      x:     Math.random() * (W || window.innerWidth),
      y:     full
               ? (H || window.innerHeight) * (0.6 + Math.random() * 0.4)
               : (H || window.innerHeight) + 5,
      r:     0.8 + Math.random() * 2,
      vy:    -(0.5 + Math.random() * 2.2),
      vx:    (Math.random() - 0.5) * 0.6,
      life:  1.0,
      decay: 0.006 + Math.random() * 0.009,
      s1:    Math.random() * 10,
      s2:    Math.random() * 10,
      hot:   Math.random() > 0.4,
    });

    // Cache de sprites tintados — se regenera cuando cambia el accent
    // Los sprites son grayscale, así que el tinte es exacto: blanco→accent, negro→negro
    let tintCache = { key: '', canvases: [] };
    const getTinted = (r, g, b) => {
      const key = `${r},${g},${b}`;
      if (tintCache.key === key) return tintCache.canvases;
      const out = sprites.map(spr => {
        if (!spr) return null;
        const oc = document.createElement('canvas');
        oc.width = spr.width; oc.height = spr.height;
        const oc2 = oc.getContext('2d');
        // 1. rellena con gradiente de color accent (punta clara, base oscura)
        const grad = oc2.createLinearGradient(0, 0, 0, spr.height);
        grad.addColorStop(0,   `rgb(255,255,255)`);
        grad.addColorStop(0.3, `rgb(${Math.min(r+80,255)},${Math.min(g+60,255)},${Math.min(b+60,255)})`);
        grad.addColorStop(0.7, `rgb(${r},${g},${b})`);
        grad.addColorStop(1,   `rgb(${Math.round(r*0.5)},${Math.round(g*0.5)},${Math.round(b*0.5)})`);
        oc2.fillStyle = grad;
        oc2.fillRect(0, 0, spr.width, spr.height);
        // 2. recorta con la forma del sprite (source-in = solo donde el sprite tiene pixels)
        oc2.globalCompositeOperation = 'destination-in';
        oc2.drawImage(spr, 0, 0);
        return oc;
      });
      tintCache = { key, canvases: out };
      return out;
    };

    let embers, bases;
    const init = () => {
      resize();
      const N = 22;
      bases = Array.from({ length: N }, (_, i) => ({
        ...makeBase(),
        x: (W / N) * i + (W / N) * (0.1 + Math.random() * 0.8),
      }));
      particles = Array.from({ length: 40 }, () => makeParticle(true));
      embers    = Array.from({ length: 200 }, () => makeEmber(true));
    };

    const CEIL = 0.92; // no pasan del 92% de altura — solo el 8% inferior

    let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      t += 0.03;
      const [r, g, b] = this.accent.rgb ?? [249, 115, 22];

      ctx.fillStyle = `rgba(${Math.max(2,Math.round(r*0.01))},${Math.max(0,Math.round(g*0.005))},${Math.max(2,Math.round(b*0.01))},0.15)`;
      ctx.fillRect(0, 0, W, H);

      if (!spritesReady) return;

      const tinted = getTinted(r, g, b);
      ctx.globalCompositeOperation = 'screen';

      // llamas base estáticas — grandes, solo oscilan
      for (const f of bases) {
        const spr = tinted[f.sprite];
        if (!spr) continue;
        const wobble      = Math.sin(t * f.speed + f.phase) * 12;
        const heightPulse = 0.75 + Math.sin(t * f.speed * 1.5 + f.phase2) * 0.25;
        const sw = f.size * f.scaleX;
        const sh = f.size * 1.5 * heightPulse;
        ctx.globalAlpha = f.baseAlpha;
        ctx.drawImage(spr, f.x + wobble - sw * 0.5, H - sh, sw, sh);
      }

      for (const p of particles) {
        const windX =
          Math.sin(t * 1.3 + p.s1) * 1.0 +
          Math.sin(t * 3.0 + p.s2 + p.y * 0.009) * 0.5;

        p.vx += windX * 0.06;
        p.vx *= 0.93;
        p.vy -= 0.01;
        p.vy  = Math.max(p.vy, -3.0);
        p.x  += p.vx;
        p.y  += p.vy;
        p.rot += p.rotSpd;
        p.life -= p.decay;

        const ceilY    = H * CEIL;
        const fadeDist = H * 0.08;
        const ceilFade = p.y < ceilY
          ? Math.max(0, (p.y - (ceilY - fadeDist)) / fadeDist)
          : 1;

        if (p.life <= 0 || ceilFade <= 0 || p.x < -100 || p.x > W + 100) {
          Object.assign(p, makeParticle(false));
          continue;
        }

        const lt    = p.life;
        const alpha = Math.sin(lt * Math.PI) * ceilFade * 0.25;
        const spr   = tinted[p.sprite];
        if (!spr) continue;

        const sw = p.size * p.scaleX;
        const sh = p.size * 1.5;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y - sh * 0.5);
        ctx.rotate(p.rot);
        ctx.drawImage(spr, -sw * 0.5, -sh * 0.5, sw, sh);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // brasas simples — puntos que suben con física
      const ECEIL = H * 0.75;
      for (const e of embers) {
        const windX =
          Math.sin(t * 1.4 + e.s1) * 1.0 +
          Math.sin(t * 3.1 + e.s2 + e.y * 0.009) * 0.5;
        e.vx += windX * 0.06; e.vx *= 0.93;
        e.vy -= 0.01; e.vy = Math.max(e.vy, -3.2);
        e.x += e.vx; e.y += e.vy;
        e.life -= e.decay;

        const fade = e.y < ECEIL ? Math.max(0, (e.y - (ECEIL - H*0.1)) / (H*0.1)) : 1;
        if (e.life <= 0 || fade <= 0 || e.x < -40 || e.x > W + 40) {
          Object.assign(e, makeEmber(false)); continue;
        }

        const lt = e.life;
        const alpha = Math.sin(lt * Math.PI) * fade * 0.9;
        let pr, pg, pb;
        if (e.hot && lt > 0.6) {
          // brasa caliente — accent más brillante
          pr = Math.min(r+100,255); pg = Math.min(g+100,255); pb = Math.min(b+100,255);
        } else if (lt > 0.35) {
          // brasa media — accent puro
          pr = Math.min(r+30,255); pg = Math.min(g+30,255); pb = Math.min(b+30,255);
        } else {
          // brasa apagándose — accent oscuro
          pr = Math.round(r*0.6); pg = Math.round(g*0.6); pb = Math.round(b*0.6);
        }
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pr},${pg},${pb},${alpha})`;
        ctx.fill();
      }
    };

    init();
    draw();
    this._ro = new ResizeObserver(resize);
    this._ro.observe(canvas);
    this._stop = () => { cancelAnimationFrame(raf); this._ro.disconnect(); };
  }

  componentWillUnmount() { this._stop?.(); this.accent.stop(); }

  render() {
    return html`<canvas ref=${this.canvasRef} style="position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1;" />`;
  }
}
