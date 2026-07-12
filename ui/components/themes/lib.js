// UI/THEMES/LIB — Helpers para backgrounds y HUDs (class components).

export function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function mixRgb(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function parseCssColor(raw, fallback = [139, 92, 246]) {
  if (!raw) return fallback;
  const colorMix = raw.match(/color-mix\(in\s+srgb,\s*([^,]+)\s+([\d.]+)%?,\s*([^)]+)\)/i);
  if (colorMix) {
    const a = parseCssColor(colorMix[1].trim(), fallback);
    const b = parseCssColor(colorMix[3].trim(), fallback);
    const t = Math.max(0, Math.min(1, Number(colorMix[2]) / 100));
    return mixRgb(a, b, t);
  }
  const nums = raw.match(/[\d.]+/g);
  if (nums?.length >= 3) return [Math.round(+nums[0]), Math.round(+nums[1]), Math.round(+nums[2])];
  if (raw.length === 7 && raw.startsWith('#')) return hexToRgb(raw);
  return fallback;
}

export function readThemeColors() {
  try {
    const cs = getComputedStyle(document.documentElement);
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
    return { accent, edge, edgeDim, glow };
  } catch (_) {
    return { accent: [139, 92, 246], edge: [139, 92, 246], edgeDim: [139, 92, 246], glow: 'rgba(139,92,246,.18)' };
  }
}

// ponytail: simplified accent watcher — single MutationObserver + setInterval fallback
const _shared = (() => {
  const listeners = new Set();
  let observer = null;
  let interval = null;
  const FALLBACK = '#8b5cf6';

  function readFromDOM() {
    try {
      const cs = getComputedStyle(document.documentElement);
      const raw = (cs.getPropertyValue('--aurora-accent').trim()
                || cs.getPropertyValue('--accent').trim());
      if (!raw) return null;
      if (raw.startsWith('rgb')) {
        const nums = raw.match(/[\d.]+/g);
        if (nums?.length >= 3) {
          const rgb = [Math.round(+nums[0]), Math.round(+nums[1]), Math.round(+nums[2])];
          const hex = '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('');
          return { hex, rgb };
        }
      }
      if (raw.length === 7 && raw.startsWith('#')) {
        return { hex: raw, rgb: hexToRgb(raw) };
      }
    } catch (_) {}
    return null;
  }

  let state = readFromDOM() ?? { hex: FALLBACK, rgb: hexToRgb(FALLBACK) };

  function read() {
    const next = readFromDOM();
    if (!next) return;
    if (next.rgb[0] === state.rgb[0] && next.rgb[1] === state.rgb[1] && next.rgb[2] === state.rgb[2]) return;
    state = next;
    for (const fn of listeners) fn(state);
  }

  function ensureObserver() {
    if (observer) return;
    observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-tema', 'style', 'class'],
      subtree: true,
    });
    // Fallback: poll every 2s in case MutationObserver misses CSS variable changes
    interval = setInterval(read, 2000);
  }

  function teardownIfEmpty() {
    if (listeners.size > 0) return;
    observer?.disconnect(); observer = null;
    if (interval) { clearInterval(interval); interval = null; }
  }

  return {
    get state() { return state; },
    subscribe(fn) {
      listeners.add(fn);
      ensureObserver();
      read();
    },
    unsubscribe(fn) {
      listeners.delete(fn);
      teardownIfEmpty();
    },
  };
})();

// Los fondos animados (Hellfire, etc.) dibujan cientos de partículas por
// frame en canvas 2D vía requestAnimationFrame sin parar — trivial en la
// GPU de una PC, pero tira el framerate a 5-10fps en celulares (reportado
// en vivo: "de 60fps en mi PC a 5fps en el celu" corriendo el mismo server
// por LAN). pointer:coarse detecta touch-primary (celu/tablet) de forma
// confiable, sin necesidad de parsear user-agent.
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

  return {
    state: localState,
    get rgb() { return localState.rgb; },
    get hex() { return localState.hex; },
    start() { _shared.subscribe(onUpdate); },
    stop()  { _shared.unsubscribe(onUpdate); },
  };
}
