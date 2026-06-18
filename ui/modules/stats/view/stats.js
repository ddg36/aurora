const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { cargarStats } from '../scripts/calcular.js';

function Tarjeta({ label, valor, icon }) {
  return html`
    <div class="bg-white/5 rounded-lg p-3 text-center">
      <div class="text-2xl">${icon}</div>
      <div class="text-xl font-semibold">${valor ?? '—'}</div>
      <div class="text-[10px] uppercase tracking-wider text-white/40">${label}</div>
    </div>
  `;
}

function Barra({ label, valor, max }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  return html`
    <div class="mb-1.5">
      <div class="flex justify-between text-xs mb-0.5">
        <span class="text-white/70 truncate">${label}</span>
        <span class="text-white/40">${valor}</span>
      </div>
      <div class="h-1.5 bg-white/5 rounded overflow-hidden">
        <div class="h-full rounded" style=${`width:${pct}%;background:var(--au-accent,#8b5cf6)`} />
      </div>
    </div>
  `;
}

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    cargarStats().then(setStats).catch(e => setErr(e.message));
  }, []);

  if (err) return html`<div class="p-8 text-center text-red-400/70 text-sm">${err}</div>`;
  if (!stats) return html`<div class="p-8 text-center text-white/30 text-sm">Cargando…</div>`;

  const maxPrompt = Math.max(1, ...(stats.prompts_top5 || []).map(p => p.usos || 0));
  const maxModelo = Math.max(1, ...(stats.modelos_usados || []).map(m => m.n || 0));

  return html`
    <div class="max-w-3xl mx-auto p-4">
      <h1 class="text-lg font-semibold mb-4">📊 Stats</h1>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
        <${Tarjeta} icon="💬" label="Chats" valor=${stats.chats_total} />
        <${Tarjeta} icon="✉" label="Mensajes" valor=${stats.mensajes_total} />
        <${Tarjeta} icon="🔤" label="Tokens est." valor=${stats.tokens_total} />
        <${Tarjeta} icon="✦" label="Prompts" valor=${stats.prompts_total} />
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div class="bg-white/5 rounded-lg p-3">
          <h2 class="text-xs uppercase tracking-widest text-white/40 mb-2">Prompts más usados</h2>
          ${(stats.prompts_top5 || []).length === 0 && html`<div class="text-xs text-white/30">Sin datos</div>`}
          ${(stats.prompts_top5 || []).map(p => html`<${Barra} key=${p.nombre} label=${p.nombre} valor=${p.usos || 0} max=${maxPrompt} />`)}
        </div>

        <div class="bg-white/5 rounded-lg p-3">
          <h2 class="text-xs uppercase tracking-widest text-white/40 mb-2">Modelos usados</h2>
          ${(stats.modelos_usados || []).length === 0 && html`<div class="text-xs text-white/30">Sin datos</div>`}
          ${(stats.modelos_usados || []).map(m => html`<${Barra} key=${m.modelo_id} label=${m.modelo_id} valor=${m.n} max=${maxModelo} />`)}
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
        <${Tarjeta} icon="🌐" label="Acciones nav" valor=${stats.nav_acciones_total} />
        <${Tarjeta} icon="☁" label="Convs cloud" valor=${stats.cloud_convs_total} />
        <${Tarjeta} icon="🔥" label="Proyectos ASH" valor=${stats.ash_proyectos_total} />
        <${Tarjeta} icon="▶" label="Extracciones YT" valor=${stats.yt_extracciones_total} />
      </div>
    </div>
  `;
}
