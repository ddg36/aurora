const html = (...args) => globalThis.html(...args);
const { useState, useEffect, useRef } = globalThis.preactHooks;

import { TABS } from './nav-tabs.js';
import { setTab } from '../../store.js';
import { getJSON } from '../shared/api.js';

// Resultados FTS del backend (/db/search) → comandos ejecutables. Cada tipo
// navega a donde corresponde: mensaje/prompt → su tab; wiki → wiki.
const ICONO_TIPO = { mensaje: '💬', prompt: '✨', wiki: '📖' };
function resultadoAComando(r) {
  const limpio = (r.fragmento || '').replace(/<\/?mark>/g, '');
  const dest = r.tipo === 'mensaje' ? 'lyra' : r.tipo === 'prompt' ? 'prompts' : 'wiki';
  return {
    id: `fts:${r.tipo}:${r.ref_id}`,
    icon: ICONO_TIPO[r.tipo] || '·',
    label: r.titulo ? `${r.titulo} — ${limpio}` : limpio,
    grupo: r.tipo === 'mensaje' ? 'Chat' : r.tipo === 'prompt' ? 'Prompt' : 'Wiki',
    run: () => setTab(dest),
  };
}

function construirComandos() {
  const irA = TABS.map(t => ({
    id: `ir:${t.id}`,
    icon: t.icon,
    label: `Ir a ${t.label}`,
    grupo: 'Navegación',
    run: () => setTab(t.id),
  }));
  return irA;
}

function filtrar(comandos, q) {
  const s = q.trim().toLowerCase();
  if (!s) return comandos;
  return comandos
    .map(c => {
      const txt = c.label.toLowerCase();
      let score = 0;
      if (txt.startsWith(s)) score = 3;
      else if (txt.includes(s)) score = 2;
      else {
        let i = 0;
        for (const ch of txt) if (ch === s[i]) i++;
        if (i === s.length) score = 1;
      }
      return { c, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.c);
}

export function CommandPalette() {
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const [ftsResults, setFtsResults] = useState([]);
  const inputRef = useRef(null);

  // Búsqueda FTS con debounce: al tipear, además de filtrar comandos de
  // navegación, consulta /db/search (chats/prompts/wiki) y suma esos
  // resultados. Sin query, no consulta (sólo comandos).
  useEffect(() => {
    const s = query.trim();
    if (s.length < 2) { setFtsResults([]); return; }
    const t = setTimeout(() => {
      getJSON(`/db/search?q=${encodeURIComponent(s)}&limit=8`)
        .then(r => setFtsResults(r?.ok ? (r.resultados || []) : []))
        .catch(() => setFtsResults([]));
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const comandos = construirComandos();
  const visibles = [
    ...filtrar(comandos, query),
    ...ftsResults.map(resultadoAComando),
  ];

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierto(a => !a);
        setQuery('');
        setSel(0);
      } else if (e.key === 'Escape' && abierto) {
        setAbierto(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto]);

  useEffect(() => {
    const onAtajo = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && TABS[n - 1]) {
        e.preventDefault();
        setTab(TABS[n - 1].id);
      }
    };
    window.addEventListener('keydown', onAtajo);
    return () => window.removeEventListener('keydown', onAtajo);
  }, []);

  useEffect(() => {
    if (abierto && inputRef.current) inputRef.current.focus();
  }, [abierto]);

  useEffect(() => { setSel(0); }, [query]);

  if (!abierto) return null;

  const ejecutar = (cmd) => {
    cmd?.run();
    setAbierto(false);
  };

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, visibles.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); ejecutar(visibles[sel]); }
  };

  return html`
    <div class="fixed inset-0 z-[9500] bg-black/60 flex items-start justify-center pt-[15vh] px-4"
      onClick=${e => e.target === e.currentTarget && setAbierto(false)}>
      <div class="w-[min(560px,95vw)] bg-[#14141c] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <input ref=${inputRef}
          class="w-full bg-transparent px-4 py-3 text-sm outline-none border-b border-white/10 text-white placeholder-white/30"
          placeholder="Buscar en chats, prompts, wiki… o ir a una vista  (Esc)"
          value=${query}
          onInput=${e => setQuery(e.target.value)}
          onKeyDown=${onInputKey} />
        <div class="max-h-[50vh] overflow-y-auto py-1">
          ${visibles.length === 0 && html`<div class="px-4 py-6 text-center text-white/30 text-sm">Sin resultados</div>`}
          ${visibles.map((c, i) => html`
            <button key=${c.id}
              onMouseEnter=${() => setSel(i)}
              onClick=${() => ejecutar(c)}
              class=${'w-full flex items-center gap-3 px-4 py-2 text-left text-sm ' + (i === sel ? 'bg-white/10' : 'hover:bg-white/5')}>
              <span class="text-base w-5 text-center">${c.icon}</span>
              <span class="flex-1 text-white/80">${c.label}</span>
              <span class="text-[10px] text-white/25">${c.grupo}</span>
            </button>
          `)}
        </div>
        <div class="px-4 py-1.5 border-t border-white/10 text-[10px] text-white/30 flex gap-3">
          <span>↑↓ navegar</span><span>↵ abrir</span><span>esc cerrar</span>
        </div>
      </div>
    </div>
  `;
}

export default CommandPalette;
