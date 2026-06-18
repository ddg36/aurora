const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;

import { getJSON, deleteJSON, BASE, hdrs } from '../../components/shared/api.js';

function tiempoRel(ts) {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const ICONO_TIPO = { nav: '🧭', error: '⚠', info: 'ℹ', duo: '⇆', backup: '💾' };

export function NotifCenter({ onClose }) {
  const [tab, setTab] = useState('eventos');
  const [eventos, setEventos] = useState([]);
  const [convs, setConvs] = useState([]);
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    getJSON('/db/eventos?limit=50').then(setEventos).catch(() => {});
    getJSON('/db/llm/cloud/conversaciones').then(setConvs).catch(() => {});
    getJSON('/db/backup/resumen').then(setResumen).catch(() => {});
  }, []);

  const limpiarEventos = async () => {
    await deleteJSON('/db/eventos').catch(() => {});
    setEventos([]);
  };

  const borrarConv = async (id) => {
    await deleteJSON(`/db/llm/cloud/conversaciones/${id}`).catch(() => {});
    setConvs(cs => cs.filter(c => c.id !== id));
  };

  const descargarBackup = async () => {
    const res = await fetch(BASE + '/db/backup', { headers: hdrs() });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aurora-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Tab = ({ id, label }) => html`
    <button onClick=${() => setTab(id)}
      class=${'px-3 py-1.5 text-xs ' + (tab === id ? 'text-white border-b-2 border-aurora-accent' : 'text-white/40')}>
      ${label}
    </button>
  `;

  return html`
    <div class="fixed inset-0 z-[9400] bg-black/50 flex justify-end" onClick=${e => e.target === e.currentTarget && onClose()}>
      <div class="w-[min(400px,95vw)] h-full bg-[#14141c] border-l border-white/10 flex flex-col">
        <div class="flex items-center gap-2 px-3 py-2 border-b border-white/10">
          <span class="text-sm font-semibold flex-1">🔔 Centro</span>
          <button class="text-white/40 hover:text-white text-lg leading-none" onClick=${onClose}>✕</button>
        </div>

        <div class="flex border-b border-white/10">
          <${Tab} id="eventos" label="Eventos" />
          <${Tab} id="cloud" label="Cloud history" />
          <${Tab} id="backup" label="Backup" />
        </div>

        <div class="flex-1 overflow-y-auto">
          ${tab === 'eventos' && html`
            <div class="p-2">
              ${eventos.length > 0 && html`
                <button onClick=${limpiarEventos} class="text-[11px] text-white/40 hover:text-red-400 mb-2">Limpiar todo</button>
              `}
              ${eventos.length === 0 && html`<div class="text-white/30 text-sm text-center py-8">Sin eventos</div>`}
              ${eventos.map(e => html`
                <div key=${e.id} class="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-xs">
                  <span>${ICONO_TIPO[e.tipo] || '·'}</span>
                  <div class="flex-1 min-w-0">
                    <div class="text-white/80 truncate">${e.mensaje}</div>
                    <div class="text-[10px] text-white/30">${e.tipo}${e.origen ? ` · ${e.origen}` : ''}</div>
                  </div>
                  <span class="text-[10px] text-white/25">${tiempoRel(e.creado_en)}</span>
                </div>
              `)}
            </div>
          `}

          ${tab === 'cloud' && html`
            <div class="p-2">
              ${convs.length === 0 && html`<div class="text-white/30 text-sm text-center py-8">Sin conversaciones capturadas</div>`}
              ${convs.map(c => html`
                <div key=${c.id} class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-xs">
                  <div class="flex-1 min-w-0">
                    <div class="text-white/80 truncate">${c.titulo || c.url || '(sin título)'}</div>
                    <div class="text-[10px] text-white/30">${c.llm} · ${tiempoRel(c.capturado_en)}</div>
                  </div>
                  ${c.url && html`<a href=${c.url} target="_blank" class="text-white/40 hover:text-white">↗</a>`}
                  <button onClick=${() => borrarConv(c.id)} class="text-white/30 hover:text-red-400">🗑</button>
                </div>
              `)}
            </div>
          `}

          ${tab === 'backup' && html`
            <div class="p-3 flex flex-col gap-3">
              <p class="text-xs text-white/50">Exportá todos tus datos (chats, prompts, wiki, ajustes, cloud, etc.) a un archivo JSON.</p>
              ${resumen && html`
                <div class="grid grid-cols-2 gap-1.5 text-xs">
                  ${Object.entries(resumen.conteos || {}).map(([k, v]) => html`
                    <div key=${k} class="flex justify-between bg-white/5 rounded px-2 py-1">
                      <span class="text-white/50">${k}</span><span class="text-white/80">${v}</span>
                    </div>
                  `)}
                </div>
              `}
              <button onClick=${descargarBackup}
                class="px-3 py-2 rounded border border-aurora-accent text-aurora-accent text-sm">💾 Descargar backup completo</button>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

export default NotifCenter;
