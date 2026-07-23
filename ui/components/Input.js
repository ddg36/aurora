import { BTN_HEIGHT } from './shared/iconButton.js';

const { html } = globalThis;

const base = `au-field w-full px-3 py-1.5 text-sm fx-focus transition-colors ${BTN_HEIGHT}`;

export function Input({ value, onInput, onChange, onKeyDown, placeholder, type = 'text', disabled, title, autofocus, inputRef, class: cls }) {
  return html`
    <input
      ref=${inputRef}
      class=${[base, disabled && 'opacity-40 cursor-not-allowed', cls].filter(Boolean).join(' ')}
      type=${type}
      value=${value}
      onInput=${onInput}
      onChange=${onChange}
      onKeyDown=${onKeyDown}
      placeholder=${placeholder}
      disabled=${disabled}
      title=${title}
      autofocus=${autofocus}
    />
  `;
}

export function Textarea({ value, onInput, onChange, onKeyDown, placeholder, rows, disabled, title, autofocus, spellcheck, class: cls }) {
  return html`
    <textarea
      class=${[base, 'resize-none leading-relaxed', disabled && 'opacity-40 cursor-not-allowed', cls].filter(Boolean).join(' ')}
      onInput=${onInput}
      onChange=${onChange}
      onKeyDown=${onKeyDown}
      placeholder=${placeholder}
      rows=${rows}
      disabled=${disabled}
      title=${title}
      autofocus=${autofocus}
      spellcheck=${spellcheck}
    >${value}</textarea>
  `;
}

// sin w-full: size="sm" es para selects inline junto a otros controles
// (headers compactos) — con w-full, si la fila no entra y hace flex-wrap,
// el select cae a su propia línea Y se estira a todo el ancho. Ancho
// puede variar según el caller, el ALTO no — mismo BTN_HEIGHT que
// Button/Chip, para que nunca desentone al lado de un ícono-solo.
const selectBaseSm = `au-field px-2 text-xs fx-focus transition-colors flex-shrink-0 ${BTN_HEIGHT}`;

export function Select({ value, onChange, disabled, title, size, style, class: cls, children }) {
  return html`
    <select
      class=${[
        size === 'sm' ? selectBaseSm : base,
        'select-clean cursor-pointer',
        disabled && 'opacity-40 cursor-not-allowed',
        cls,
      ].filter(Boolean).join(' ')}
      style=${style}
      value=${value}
      onChange=${onChange}
      disabled=${disabled}
      title=${title}
    >${children}</select>
  `;
}
