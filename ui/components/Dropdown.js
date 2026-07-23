const { html } = globalThis;

export function Dropdown({ open, children }) {
  if (!open) return null;
  return html`
    <div class="au-dropdown absolute left-0 right-0 top-full mt-1 z-30 overflow-hidden">
      ${children}
    </div>
  `;
}

export function DropdownItem({ onClick, children }) {
  return html`
    <button
      type="button"
      class="au-dropdown-item block w-full px-3.5 py-2 text-left text-xs transition-colors"
      onClick=${onClick}
    >
      ${children}
    </button>
  `;
}
