const { html } = globalThis;

const base = 'w-full bg-aurora-surface-2 border border-aurora-border rounded-md px-3 py-1.5 text-sm text-aurora-text fx-focus transition-colors min-h-8';

export function Input({ value, onInput, onChange, onKeyDown, placeholder, type = 'text', disabled, title, class: cls }) {
  return html`
    <input
      class=${[base, disabled && 'opacity-40 cursor-not-allowed', cls].filter(Boolean).join(' ')}
      type=${type}
      value=${value}
      onInput=${onInput}
      onChange=${onChange}
      onKeyDown=${onKeyDown}
      placeholder=${placeholder}
      disabled=${disabled}
      title=${title}
    />
  `;
}

export function Textarea({ value, onInput, onChange, onKeyDown, placeholder, rows, disabled, class: cls }) {
  return html`
    <textarea
      class=${[base, 'resize-none leading-relaxed', disabled && 'opacity-40 cursor-not-allowed', cls].filter(Boolean).join(' ')}
      onInput=${onInput}
      onChange=${onChange}
      onKeyDown=${onKeyDown}
      placeholder=${placeholder}
      rows=${rows}
      disabled=${disabled}
    >${value}</textarea>
  `;
}

export function Select({ value, onChange, disabled, title, class: cls, children }) {
  return html`
    <select
      class=${[base, 'cursor-pointer', disabled && 'opacity-40 cursor-not-allowed', cls].filter(Boolean).join(' ')}
      value=${value}
      onChange=${onChange}
      disabled=${disabled}
      title=${title}
    >${children}</select>
  `;
}
