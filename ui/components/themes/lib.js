// UI/THEMES/LIB — Helpers compartidos para temas, backgrounds y HUDs.

export function hexToRgb(hex, fallback = [139, 92, 246]) {
  const raw = String(hex || '').trim();
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(raw);
  if (short) return short.slice(1).map(x => parseInt(x + x, 16));
  const full = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(raw);
  if (full) return full.slice(1).map(x => parseInt(x, 16));
  return [...fallback];
}

export function mixRgb(a, b, t) {
  const k = Math.max(0, Math.min(1, Number(t) || 0));
  return a.map((v, i) => Math.round(v + (b[i] - v) * k));
}

export function parseCssColor(raw, fallback = [139, 92, 246]) {
  const value = String(raw || '').trim();
  if (!value) return [...fallback];

  // Hex debe comprobarse ANTES que los números sueltos. El parser anterior
  // interpretaba #8b5cf6 como [8, 5, 6], apagando casi todos los fondos claros.
  if (/^#[\da-f]{3}$/i.test(value) || /^#[\da-f]{6}$/i.test(value)) {
    return hexToRgb(value, fallback);
  }

  const colorMix = value.match(/color-mix\(in\s+srgb,\s*([^,]+?)\s+([\d.]+)%?\s*,\s*([^)]+)\)/i);
  if (colorMix) {
    const a = parseCssColor(colorMix[1].trim(), fallback);
    const b = parseCssColor(colorMix[3].trim(), fallback);
    return mixRgb(a, b, Number(colorMix[2]) / 100);
  }

  const rgbMatch = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgbMatch) return rgbMatch.slice(1, 4).map(n => Math.max(0, Math.min(255, Math.round(Number(n)))));

  // Algunos navegadores exponen colores computados como "6 182 212".
  const nums = value.match(/[\d.]+/g);
  if (nums?.length >= 3) return nums.slice(0, 3).map(n => Math.max(0, Math.min(255, Math.round(Number(n)))));

  return [...fallback];
}

let _themeColorCache = { key: '', value: null };

export function readThemeColors() {
  try {
    const root = document.documentElement;
    const animated = root.dataset.tema === 'aurora';
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const revision = root.dataset.themeRevision || '';
    const inlineStyle = root.getAttribute('style') || '';
    const key = `${revision}|${root.dataset.tema || ''}|${root.dataset.themeMode || ''}|${inlineStyle}|${animated ? Math.floor(now / 80) : 0}`;
    if (_themeColorCache.key === key && _themeColorCache.value) return _themeColorCache.value;
    const cs = getComputedStyle(root);
    const accent = parseCssColor(
      cs.getPropertyValue('--aurora-accent').trim() || cs.getPropertyValue('--accent').trim(),
      [139, 92, 246],
    );
    const edge = parseCssColor(cs.getPropertyValue('--aurora-edge').trim(), accent);
    const edgeDim = parseCssColor(
      cs.getPropertyValue('--aurora-edge-dim').trim() || cs.getPropertyValue('--aurora-accent-dim').trim(),
      accent,
    );
    const glow = cs.getPropertyValue('--aurora-edge-glow').trim()
      || cs.getPropertyValue('--aurora-accent-glow').trim()
      || cs.getPropertyValue('--aurora-glow').trim()
      || `rgba(${accent[0]},${accent[1]},${accent[2]},.18)`;
    const value = { accent, edge, edgeDim, glow };
    _themeColorCache = { key, value };
    return value;
  } catch (_) {
    return { accent: [139, 92, 246], edge: [139, 92, 246], edgeDim: [139, 92, 246], glow: 'rgba(139,92,246,.18)' };
  }
}

// Ajusta un canvas a su tamaño CSS real y conserva coordenadas lógicas.
// Limitar DPR evita superficies 4K innecesarias en móviles/monitores retina.
export function fitCanvas(canvas, ctx, { maxDpr = 2 } = {}) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || window.innerWidth || 1));
  const height = Math.max(1, Math.round(rect.height || window.innerHeight || 1));
  const dpr = Math.max(1, Math.min(maxDpr, window.devicePixelRatio || 1));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height, dpr };
}

export function prefersReducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

export function sceneQuality() {
  // No congelar escenas por la preferencia global del SO. Aurora conserva
  // movimiento suave y reduce densidad; sólo `data-motion=off` las detiene.
  if (document.documentElement.dataset.motion === 'off') return 'still';
  if (prefersReducedMotion()) return 'low';
  if (esDispositivoLiviano()) return 'low';
  try {
    if ((navigator.hardwareConcurrency || 8) <= 4) return 'low';
  } catch (_) {}
  return 'high';
}

// Accent watcher compartido. Observa sólo html/body; la versión anterior
// observaba `subtree:true`, por lo que cambios de clase dentro del chat podían
// disparar lecturas de estilo sin relación con el tema.
const _shared = (() => {
  const listeners = new Set();
  let observers = [];
  let interval = null;
  let lastAnimatedRead = 0;
  const FALLBACK = '#8b5cf6';

  function readFromDOM() {
    try {
      const cs = getComputedStyle(document.documentElement);
      const raw = cs.getPropertyValue('--aurora-accent').trim()
        || cs.getPropertyValue('--accent').trim();
      if (!raw) return null;
      const rgb = parseCssColor(raw, hexToRgb(FALLBACK));
      const hex = '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('');
      return { hex, rgb };
    } catch (_) {
      return null;
    }
  }

  let state = readFromDOM() ?? { hex: FALLBACK, rgb: hexToRgb(FALLBACK) };

  function read(force = false) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const animated = document.documentElement.dataset.tema === 'aurora';
    if (!force && animated && now - lastAnimatedRead < 80) return state;
    if (animated) lastAnimatedRead = now;
    const next = readFromDOM();
    if (!next) return state;
    if (next.rgb[0] === state.rgb[0] && next.rgb[1] === state.rgb[1] && next.rgb[2] === state.rgb[2]) return state;
    state = next;
    for (const fn of listeners) fn(state);
    return state;
  }

  function ensureObserver() {
    if (observers.length) return;
    const options = { attributes: true, attributeFilter: ['data-theme', 'data-tema', 'data-theme-mode', 'style', 'class'] };
    for (const node of [document.documentElement, document.body].filter(Boolean)) {
      const observer = new MutationObserver(() => read(true));
      observer.observe(node, options);
      observers.push(observer);
    }
    interval = setInterval(() => read(true), 1200);
  }

  function teardownIfEmpty() {
    if (listeners.size > 0) return;
    observers.forEach(o => o.disconnect());
    observers = [];
    if (interval) { clearInterval(interval); interval = null; }
  }

  return {
    get state() { return read(false); },
    sample() { return read(false); },
    subscribe(fn) {
      listeners.add(fn);
      ensureObserver();
      read(true);
    },
    unsubscribe(fn) {
      listeners.delete(fn);
      teardownIfEmpty();
    },
  };
})();

// Los fondos animados dibujan muchas partículas por frame. En pantallas
// táctiles o estrechas reducimos densidad; no depende de user-agent.
export function esDispositivoLiviano() {
  try {
    return matchMedia('(pointer: coarse)').matches || window.innerWidth < 820;
  } catch (_) {
    return false;
  }
}

export function createAccentWatcher(_defaultHex = '#8b5cf6') {
  const initial = _shared.state;
  const localState = { hex: initial.hex, rgb: initial.rgb };
  const onUpdate = (s) => { localState.hex = s.hex; localState.rgb = s.rgb; };
  const sample = () => {
    const s = _shared.sample();
    localState.hex = s.hex;
    localState.rgb = s.rgb;
    return localState;
  };

  return {
    get state() { return sample(); },
    get rgb() { return sample().rgb; },
    get hex() { return sample().hex; },
    start() { _shared.subscribe(onUpdate); },
    stop()  { _shared.unsubscribe(onUpdate); },
  };
}

// Un canvas cinematográfico no gana nada perceptible dibujando a 60/120 Hz,
// pero sí compite con todo Chrome por CPU/GPU. Este scheduler conserva la
// animación a 30 fps (20 en calidad baja) y, a diferencia de un simple
// "frame skip", sigue siendo cancelable aunque necesite varios RAF para
// alcanzar el siguiente frame lógico.
let _sceneFrameId = 0;
const _sceneFrames = new Map();

export function sceneFrame(callback) {
  if (document.documentElement.dataset.motion === 'off') return 0;
  const id = ++_sceneFrameId;
  const startedAt = performance.now();
  const minFrameMs = sceneQuality() === 'low' ? 50 : 33;
  const tick = now => {
    const job = _sceneFrames.get(id);
    if (!job) return;
    if (now - startedAt < minFrameMs) {
      job.raf = requestAnimationFrame(tick);
      return;
    }
    _sceneFrames.delete(id);
    callback(now);
  };
  _sceneFrames.set(id, { raf: requestAnimationFrame(tick) });
  return id;
}

export function cancelSceneFrame(id) {
  const job = _sceneFrames.get(id);
  if (!job) return;
  cancelAnimationFrame(job.raf);
  _sceneFrames.delete(id);
}
