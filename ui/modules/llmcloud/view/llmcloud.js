const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { LLM_PRESETS, cargarURLsCloud } from '../scripts/urls.js';
import { setViewActions, clearViewActions } from '../../../components/footer/registry.js';
import { Toast } from '../../../components/shared/toast.js';
import { DuoPanel } from '../scripts/duo-panel.js';

export default function LLMCloud() {
  const [urls, setUrls] = useState([]);
  const [split, setSplit] = useState(false);
  const [izq, setIzq] = useState(null);
  const [der, setDer] = useState(null);
  const [foco, setFoco] = useState('izq');
  const [duoAbierto, setDuoAbierto] = useState(false);

  useEffect(() => {
    cargarURLsCloud().then(todas => {
      const list = todas.length ? todas : LLM_PRESETS;
      setUrls(list);
      setIzq(list[0] || null);
      setDer(list[1] || list[0] || null);
    });
  }, []);

  const capturaExtension = (n) => Toast.show(`Captura del panel ${n} requiere la extensión de browser`, 'warning');
  const extraerExtension = (n) => Toast.show(`Extraer texto del panel ${n} requiere la extensión de browser`, 'warning');
  const swap = () => { setIzq(der); setDer(izq); };

  useEffect(() => {
    const slots = split ? [1, 2] : [1];
    const sup = ['¹', '²', '³'];
    const acciones = [];
    for (const n of slots) {
      acciones.push({ id: `txt-${n}`, icon: `📄${sup[n - 1]}`, title: `Extraer texto panel ${n}`, onClick: () => extraerExtension(n) });
      acciones.push({ id: `shot-${n}`, icon: `📸${sup[n - 1]}`, title: `Captura panel ${n}`, onClick: () => capturaExtension(n) });
    }
    if (split) {
      acciones.push({ id: 'swap', icon: '⇄', title: 'Intercambiar paneles', onClick: swap });
    }
    acciones.push({ id: 'duo', icon: '⇆ Duo', title: 'Duo — dos IAs conversando (nativo, sin extensión)', onClick: () => setDuoAbierto(true) });
    setViewActions(acciones);
    return () => clearViewActions();
  }, [split, izq, der]);

  const elegir = (u) => {
    if (!split || foco === 'izq') setIzq(u);
    else setDer(u);
  };

  const abrirVentana = (url) => {
    if (url) window.open(url, '_blank', 'noopener');
  };

  const Panel = ({ sel, lado }) => html`
    <div
      class=${`flex-1 flex flex-col min-w-0 ${split && foco === lado ? 'ring-1 ring-inset' : ''}`}
      style=${split && foco === lado ? 'ring-color:var(--au-accent,#8b5cf6)' : ''}
      onClick=${() => setFoco(lado)}
    >
      ${sel ? html`
        <div class="flex items-center gap-1 px-1.5 py-0.5 bg-black/20 border-b border-white/5">
          <span class="flex-1 text-[10px] text-white/30 truncate">${sel.url}</span>
          <button
            class="px-1.5 py-0.5 rounded text-[10px] text-white/50 hover:text-white hover:bg-white/10"
            onClick=${(e) => { e.stopPropagation(); abrirVentana(sel.url); }}
            title="Abrir en ventana nueva (usa tu sesión del browser)"
          >🔗 Abrir</button>
        </div>
        <iframe
          src=${sel.url}
          data-pane=${lado === 'izq' ? 1 : 2}
          class="flex-1 w-full border-0 bg-white"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          allow="clipboard-read; clipboard-write; microphone"
        />
      ` : html`<div class="flex-1 flex items-center justify-center text-white/30 text-sm">Elegí un LLM arriba</div>`}
    </div>
  `;

  return html`
    <div class="flex flex-col h-full">
      <div class="flex items-center gap-1 px-2 py-1.5 border-b border-white/5 overflow-x-auto">
        ${urls.map(u => html`
          <button
            key=${u.id}
            onClick=${() => elegir(u)}
            title=${u.url}
            class=${`flex items-center gap-1.5 px-2 py-1 rounded text-xs whitespace-nowrap
              ${(izq?.id === u.id || (split && der?.id === u.id)) ? 'bg-white/15' : 'hover:bg-white/10 text-white/60'}`}
          >
            ${u.icono && html`<img src=${u.icono} class="w-3.5 h-3.5 rounded-sm" onError=${e => e.target.style.display = 'none'} />`}
            ${u.nombre}
          </button>
        `)}
        <span class="flex-1" />
        <button
          onClick=${() => setSplit(!split)}
          class=${`px-2 py-1 rounded text-xs ${split ? 'bg-white/15' : 'hover:bg-white/10 text-white/50'}`}
          title="Vista dividida"
        >⫿⫿ Split</button>
      </div>

      <div class="flex-1 flex min-h-0">
        <${Panel} sel=${izq} lado="izq" />
        ${split && html`
          <div class="w-px bg-white/10" />
          <${Panel} sel=${der} lado="der" />
        `}
      </div>

      <div class="px-2 py-1 text-[10px] text-white/30 border-t border-white/5 flex items-center gap-2">
        <span>Si el iframe queda en blanco → el sitio bloquea embeds (X-Frame-Options). Usá 🔗 Abrir para abrirlo en tu browser con sesión activa.</span>
        ${izq && html`<button class="underline hover:text-white/60" onClick=${() => abrirVentana(izq.url)}>${izq.nombre} ↗</button>`}
        ${split && der && html`<button class="underline hover:text-white/60" onClick=${() => abrirVentana(der.url)}>${der.nombre} ↗</button>`}
      </div>

      ${duoAbierto && html`<${DuoPanel} onClose=${() => setDuoAbierto(false)} />`}
    </div>
  `;
}
