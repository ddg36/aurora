// UI/THEMES/MANAGER — Aplica el tema (variables CSS) al DOM.
// Backgrounds y HUDs ya no se aplican aquí — son componentes Preact
// que el shell renderiza condicionalmente desde state.background / state.hud.

import { themeMode } from '../../store.js';
import { THEMES } from './index.js';
import { hexToRgb } from './lib.js';

let _styleEl = null;

function mixHex(a, b, t) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  const out = ar.map((v, i) => Math.round(v + (br[i] - v) * t));
  return `#${out.map(n => n.toString(16).padStart(2, '0')).join('')}`;
}

function rgbaHex(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function _getStyleEl() {
  if (!_styleEl) {
    _styleEl = document.createElement('style');
    _styleEl.id = 'aurora-tema-vars';
    document.head.appendChild(_styleEl);
  }
  return _styleEl;
}

export function aplicarTema(temaInput) {
  if (!temaInput) return;

  const tema = typeof temaInput === 'object'
    ? temaInput
    : THEMES.find(t => t.id === temaInput);

  if (!tema?.id) return;

  const temaId = tema.id;
  const mode = themeMode.value === 'light' ? 'light' : 'dark';
  const category = tema.category || 'cosmic';
  document.body.dataset.tema = temaId;
  document.documentElement.dataset.tema = temaId;
  document.body.dataset.themeCategory = category;
  document.documentElement.dataset.themeCategory = category;
  document.body.dataset.themeMode = mode;
  document.documentElement.dataset.themeMode = mode;

  const base = mode === 'light'
    ? {
      bg: '#ffffff',
      surface: '#ffffff',
      surface1: '#ffffff',
      surface2Base: mixHex('#f4f6fb', tema.accent, 0.045),
      surface3: mixHex('#e6eaf2', tema.accent, 0.055),
      hover: 'rgba(15,23,42,0.055)',
      field: 'rgba(15,23,42,0.045)',
      text: '#10131a',
      muted: '#4b5565',
      dim: '#7b8496',
      glass: 'rgba(255,255,255,0.72)',
      glassHi: 'rgba(255,255,255,0.88)',
      glassShadow: 'rgba(15,23,42,0.12)',
      border: 'rgba(15,23,42,0.12)',
      borderQuiet: 'rgba(15,23,42,0.08)',
      borderStrong: 'rgba(15,23,42,0.18)',
      shadowSm: '0 1px 2px rgba(15,23,42,0.08)',
      shadowMd: '0 12px 32px rgba(15,23,42,0.12)',
      accentSurface: `color-mix(in srgb, ${tema.accent} 10%, #ffffff)`,
      accentDim: mixHex(tema.accent, '#111827', 0.42),
      glow: rgbaHex(tema.accent, 0.18),
    }
    : {
      bg: category === 'gothic' ? '#020102' : '#000000',
      surface: category === 'gothic' ? '#080506' : '#0a0a0a',
      surface1: category === 'gothic' ? '#0c080a' : '#0a0a0a',
      surface2Base: category === 'gothic' ? mixHex('#100b0e', tema.accent, 0.075) : '#111116',
      surface3: category === 'gothic' ? mixHex('#1b1518', tema.accent, 0.055) : '#1c1c1c',
      hover: 'rgba(255,255,255,0.045)',
      field: 'rgba(255,255,255,0.035)',
      text: category === 'gothic' ? '#f2edf0' : '#ffffff',
      muted: category === 'gothic' ? '#a99ca2' : '#9a99a8',
      dim: category === 'gothic' ? '#71656b' : '#6b6a7a',
      glass: 'rgba(255,255,255,0.03)',
      glassHi: 'rgba(255,255,255,0.06)',
      glassShadow: 'rgba(13,12,34,0.5)',
      border: category === 'gothic' ? 'rgba(205,184,193,0.10)' : 'rgba(255,255,255,0.08)',
      borderQuiet: category === 'gothic' ? 'rgba(205,184,193,0.065)' : 'rgba(255,255,255,0.055)',
      borderStrong: category === 'gothic' ? 'rgba(221,198,207,0.18)' : 'rgba(255,255,255,0.14)',
      shadowSm: '0 1px 2px rgba(0,0,0,0.28)',
      shadowMd: '0 10px 30px rgba(0,0,0,0.32)',
      accentSurface: tema.surface2,
      accentDim: tema.accentDim,
      glow: tema.edgeGlow,
    };

  const [accentR, accentG, accentB] = hexToRgb(tema.accent);
  const accentRgb = `${accentR}, ${accentG}, ${accentB}`;
  const link = mode === 'light' ? mixHex(tema.accent, '#111827', 0.24) : mixHex(tema.accent, '#ffffff', 0.18);

  if (tema.animated) {
    _getStyleEl().textContent = `
      @property --aurora-accent {
        syntax: '<color>';
        inherits: true;
        initial-value: #00e5cc;
      }
      @property --accent {
        syntax: '<color>';
        inherits: true;
        initial-value: #00e5cc;
      }
      @property --aurora-edge {
        syntax: '<color>';
        inherits: true;
        initial-value: #00e5cc;
      }
      @property --aurora-text-bright {
        syntax: '<color>';
        inherits: true;
        initial-value: #00e5cc;
      }
      @keyframes aurora-shift {
        0%   { --aurora-accent: #00e5cc; --accent: #00e5cc; --aurora-edge: #00e5cc; --aurora-text-bright: #00e5cc; }
        20%  { --aurora-accent: #00ff88; --accent: #00ff88; --aurora-edge: #00ff88; --aurora-text-bright: #00ff88; }
        40%  { --aurora-accent: #a855f7; --accent: #a855f7; --aurora-edge: #a855f7; --aurora-text-bright: #a855f7; }
        60%  { --aurora-accent: #ec4899; --accent: #ec4899; --aurora-edge: #ec4899; --aurora-text-bright: #ec4899; }
        80%  { --aurora-accent: #06b6d4; --accent: #06b6d4; --aurora-edge: #06b6d4; --aurora-text-bright: #06b6d4; }
        100% { --aurora-accent: #00e5cc; --accent: #00e5cc; --aurora-edge: #00e5cc; --aurora-text-bright: #00e5cc; }
      }
      :root {
        animation: aurora-shift 8s ease-in-out infinite;
        color-scheme: ${mode};
        --aurora-bg: ${base.bg};
        --aurora-accent-rgb: ${accentRgb};
        --accent-rgb: ${accentRgb};
        --aurora-link: ${link};
        --aurora-surface: ${base.surface};
        --aurora-surface-1: ${base.surface1};
        --aurora-surface-2: ${base.surface2Base};
        --aurora-surface3: ${base.surface3};
        --aurora-surface-hover: ${base.hover};
        --aurora-field: ${base.field};
        --aurora-text: ${base.text};
        --aurora-text-muted: ${base.muted};
        --aurora-text-dim: ${base.dim};
        --aurora-glass: ${base.glass};
        --aurora-glass-highlight: ${base.glassHi};
        --aurora-glass-shadow: ${base.glassShadow};
        --aurora-border: ${base.border};
        --aurora-border-quiet: ${base.borderQuiet};
        --aurora-border-strong: ${base.borderStrong};
        --aurora-shadow-sm: ${base.shadowSm};
        --aurora-shadow-md: ${base.shadowMd};
        --aurora-surface2:    ${base.accentSurface};
        --aurora-edge:        var(--aurora-accent);
        --aurora-edge-dim:    ${base.accentDim};
        --aurora-edge-glow:   ${base.glow};
        --aurora-text-bright: var(--aurora-accent);
        --aurora-accent-dim:  ${base.accentDim};
        --aurora-accent-glow: ${base.glow};
        --aurora-glow:        ${base.glow};
      }
    `;
  } else {
    _getStyleEl().textContent = `
      :root {
        animation: none;
        color-scheme: ${mode};
        --aurora-bg:         ${base.bg};
        --aurora-accent-rgb:${accentRgb};
        --accent-rgb:       ${accentRgb};
        --aurora-link:      ${link};
        --aurora-surface:    ${base.surface};
        --aurora-surface-1:  ${base.surface1};
        --aurora-surface-2:  ${base.surface2Base};
        --aurora-surface3:   ${base.surface3};
        --aurora-surface-hover:${base.hover};
        --aurora-field:      ${base.field};
        --aurora-text:       ${base.text};
        --aurora-text-muted: ${base.muted};
        --aurora-text-dim:   ${base.dim};
        --aurora-glass:      ${base.glass};
        --aurora-glass-highlight:${base.glassHi};
        --aurora-glass-shadow:${base.glassShadow};
        --aurora-border:     ${base.border};
        --aurora-border-quiet:${base.borderQuiet};
        --aurora-border-strong:${base.borderStrong};
        --aurora-shadow-sm:  ${base.shadowSm};
        --aurora-shadow-md:  ${base.shadowMd};
        --accent:            ${tema.accent};
        --aurora-accent:     ${tema.accent};
        --aurora-surface2:   ${base.accentSurface};
        --aurora-edge:       ${tema.accent};
        --aurora-edge-dim:   ${base.accentDim};
        --aurora-edge-glow:  ${base.glow};
        --aurora-text-bright:${tema.accent};
        --aurora-accent-dim: ${base.accentDim};
        --aurora-accent-glow:${base.glow};
        --aurora-glow:       ${base.glow};
      }
    `;
  }

  const root = document.documentElement;
  root.dataset.themeRevision = String((Number(root.dataset.themeRevision) || 0) + 1);
}
