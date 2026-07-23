const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;
import { cargarStats } from '../scripts/calcular.js';
import { ToolPage, ToolHeader, ToolSection, MetricStrip, Metric } from '../../../components/index.js?v=v1-surface-convergence-1';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

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

  useEffect(() => registerAIView({
    id: 'stats',
    description: 'Lectura agregada de actividad, modelos, prompts y artefactos de Aurora.',
    actions: {
      overview: { description: 'Devuelve el snapshot estadístico completo.', readOnly: true, run: async () => stats || cargarStats() },
      refresh: { description: 'Actualiza el snapshot estadístico visible.', readOnly: true, run: async () => { const next = await cargarStats(); setStats(next); return next; } },
    },
  }), [stats]);

  if (err) return html`<div class="p-8 text-center text-red-400/70 text-sm">${err}</div>`;
  if (!stats) return html`<div class="p-8 text-center text-white/30 text-sm">Cargando…</div>`;

  const maxPrompt = Math.max(1, ...(stats.prompts_top5 || []).map(p => p.usos || 0));
  const maxModelo = Math.max(1, ...(stats.modelos_usados || []).map(m => m.n || 0));

  return html`
    <${ToolPage}>
      <${ToolHeader} icon="chart" eyebrow="Actividad" title="Estadísticas" description="Señales de uso reales, sin convertir cada número en una tarjeta ornamental." />
      <${MetricStrip}>
        <${Metric} icon="prompt" label="Chats" value=${stats.chats_total} accent />
        <${Metric} icon="inbox" label="Mensajes" value=${stats.mensajes_total} />
        <${Metric} icon="braces" label="Tokens est." value=${stats.tokens_total} />
        <${Metric} icon="spark" label="Prompts" value=${stats.prompts_total} />
      <//>

      <div class="tool-workbench-grid">
        <${ToolSection} title="Prompts más usados" description="Qué recursos vuelven a ser útiles.">
          ${(stats.prompts_top5 || []).length === 0 && html`<div class="text-xs text-white/30">Sin datos</div>`}
          ${(stats.prompts_top5 || []).map(p => html`<${Barra} key=${p.nombre} label=${p.nombre} valor=${p.usos || 0} max=${maxPrompt} />`)}
        <//>

        <${ToolSection} title="Modelos usados" description="Distribución por proveedor.">
          ${(stats.modelos_usados || []).length === 0 && html`<div class="text-xs text-white/30">Sin datos</div>`}
          ${(stats.modelos_usados || []).map(m => html`<${Barra} key=${m.modelo_id} label=${m.modelo_id} valor=${m.n} max=${maxModelo} />`)}
        <//>
      </div>

      <${MetricStrip}>
        <${Metric} icon="globe" label="Acciones nav" value=${stats.nav_acciones_total} />
        <${Metric} icon="cloud" label="Convs cloud" value=${stats.cloud_convs_total} />
        <${Metric} icon="folder" label="Proyectos ASH" value=${stats.ash_proyectos_total} />
        <${Metric} icon="play" label="Extracciones YT" value=${stats.yt_extracciones_total} />
      <//>
    <//>
  `;
}
