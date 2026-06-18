// UI/THEMES/LIB — Helpers para backgrounds y HUDs (class components).

function hexToRgb(hex) {
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

// Singleton: un solo lector de --aurora-accent compartido por todos los watchers.
// Evita N observers + N intervals para el mismo valor CSS.
const _shared = (() => {
  const listeners = new Set();
  let   observer  = null;
  let   headObs   = null;

  const FALLBACK = '#8b5cf6';

  function readFromDOM() {
    try {
      const cs  = getComputedStyle(document.documentElement);
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
    // Solo notifica si el color realmente cambió
    if (next.rgb[0] === state.rgb[0] && next.rgb[1] === state.rgb[1] && next.rgb[2] === state.rgb[2]) return;
    state = next;
    for (const fn of listeners) fn(state);
  }

  function attachStyleObserver() {
    const styleEl = document.getElementById('aurora-tema-vars');
    if (!styleEl || headObs?._target === styleEl) return;
    headObs?.disconnect();
    headObs = new MutationObserver(read);
    headObs._target = styleEl;
    headObs.observe(styleEl, { childList: true, characterData: true, subtree: true });
  }

  function ensureObserver() {
    if (observer) return;
    observer = new MutationObserver(() => { attachStyleObserver(); read(); });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-tema', 'style', 'class'],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-tema', 'data-theme', 'style', 'class'],
    });
    // Observa <head> para detectar cuando aurora-tema-vars aparece por primera vez
    observer.observe(document.head, { childList: true });
    attachStyleObserver();
  }

  function teardownIfEmpty() {
    if (listeners.size > 0) return;
    observer?.disconnect(); observer = null;
    headObs?.disconnect();  headObs  = null;
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

// Tracker del --accent. API idéntica a la anterior — sin cambios en los backgrounds.
export function createAccentWatcher(_defaultHex = '#8b5cf6') {
  // Lee el color actual del DOM ahora mismo, sin esperar a start().
  // Si el DOM aún no tiene el valor, usa el estado del singleton (que ya lo leyó).
  const initial    = _shared.state;
  const localState = { hex: initial.hex, rgb: initial.rgb };
  const onUpdate   = (s) => { localState.hex = s.hex; localState.rgb = s.rgb; };

  return {
    state: localState,
    get rgb() { return localState.rgb; },
    get hex() { return localState.hex; },
    start()   { _shared.subscribe(onUpdate); },
    stop()    { _shared.unsubscribe(onUpdate); },
  };
}
