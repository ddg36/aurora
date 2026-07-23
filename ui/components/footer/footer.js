const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;

import { footActions } from './registry.js';
import { iconButtonClass, useWheelHorizontalScroll, ICON_BTN_SQUARE } from '../shared/iconButton.js';
import { Icon, resolveIconName } from '../Icon.js';

function Boton({ a }) {
  const active = typeof a.active === 'function' ? a.active() : a.active;
  const disabled = typeof a.disabled === 'function' ? a.disabled() : a.disabled;
  return html`
    <button
      key=${a.id}
      class=${iconButtonClass(active, `${ICON_BTN_SQUARE} footer-action disabled:opacity-40 disabled:cursor-not-allowed`)}
      disabled=${disabled}
      title=${a.title || a.id}
      onClick=${a.onClick}
    >
      ${resolveIconName(a.icon)
        ? html`<${Icon} name=${a.icon} size=${16} />`
        : html`<span class="footer-action-label">${a.icon || a.id}</span>`}
    </button>
  `;
}

function renderItem(a) {
  if (a.component) {
    const Cmp = a.component;
    return html`<${Cmp} key=${a.id} action=${a} />`;
  }
  return html`<${Boton} key=${a.id} a=${a} />`;
}

export function Footer() {
  const [acts, setActs] = useState(footActions.value);
  useEffect(() => footActions.subscribe(setActs), []);
  const scrollRef = useRef(null);
  useWheelHorizontalScroll(scrollRef);

  const groups = [acts.global, acts.module, acts.view].filter(g => g && g.length > 0);
  if (groups.length === 0) return null;

  return html`
    <footer class="aurora-footer flex-shrink-0">
      <div ref=${scrollRef} class="flex gap-1 overflow-x-auto scrollbar-none">
        ${groups.map((group, i) => html`
          ${i > 0 && html`<span class="w-px h-5 my-1 mx-1.5 flex-shrink-0 bg-white/10"></span>`}
          ${group.map(renderItem)}
        `)}
      </div>
    </footer>
  `;
}

export default Footer;
