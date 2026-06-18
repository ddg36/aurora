const { html } = globalThis;

export function Dropdown({ open, children }) {
  if (!open) return null;
  return html`
    <div class="absolute left-0 right-0 top-full mt-1 z-30 overflow-hidden rounded-md border border-aurora-border bg-aurora-surface shadow-md">
      ${children}
    </div>
  `;
}

export function DropdownItem({ onClick, children }) {
  return html`
    <button
      type="button"
      class="block w-full px-3.5 py-2 text-left text-xs text-aurora-text transition-colors hover:bg-aurora-accent/10"
      onClick=${onClick}
    >
      ${children}
    </button>
  `;
}
