const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;

import { footActions } from './registry.js';

function Boton({ a }) {
  const active = typeof a.active === 'function' ? a.active() : a.active;
  const disabled = typeof a.disabled === 'function' ? a.disabled() : a.disabled;
  return html`
    <button
      key=${a.id}
      class=${'h-7 min-w-7 flex-shrink-0 px-1.5 text-sm transition-transform bg-transparent border-0 cursor-pointer text-white/40 hover:text-white/80 disabled:opacity-40 disabled:cursor-not-allowed ' + (active ? 'text-aurora-accent' : '')}
      disabled=${disabled}
      title=${a.title || a.id}
      onClick=${a.onClick}
    >
      <span class="inline-block leading-none">${a.icon || a.id}</span>
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

  const groups = [acts.global, acts.module, acts.view].filter(g => g && g.length > 0);
  if (groups.length === 0) return null;

  return html`
    <footer class="px-2 py-1.5 border-t border-white/5 bg-black/20 backdrop-blur-sm flex-shrink-0">
      <div class="flex gap-1 overflow-x-auto scrollbar-none">
        ${groups.map((group, i) => html`
          ${i > 0 && html`<span class="w-px h-5 my-1 mx-1.5 flex-shrink-0 bg-white/10"></span>`}
          ${group.map(renderItem)}
        `)}
      </div>
    </footer>
  `;
}

export default Footer;
