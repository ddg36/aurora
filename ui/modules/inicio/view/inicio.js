const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;

import { nexusOnline, setTab } from '../../../store.js';
import { startPing, stopPing } from '../scripts/ping.js';
import { pingAurora, cargarDashboardStats, cargarHealth, formatBytes, formatUptime } from '../scripts/dashboard.js';
import { QUICK_ACTIONS } from '../foot/actions.js';
import { Button, Icon, Panel, PanelBody, Status } from '../../../components/index.js?v=v11-home-command-deck-1';
import { registerAIView } from '../../../components/shared/ai-view-actions.js';

function HealthNode({ ok, icon, label, detail }) {
  return html`
    <div class=${`home-health-node ${ok ? 'is-online' : 'is-offline'}`}>
      <span class="home-health-icon"><${Icon} name=${icon} size=${15} /><//>
      <span class="home-health-copy">
        <strong>${label}</strong>
        <small>${detail}</small>
      </span>
      <span class="home-health-indicator" aria-label=${ok ? 'Disponible' : 'No disponible'}></span>
    </div>
  `;
}

function Metric({ label, value }) {
  return html`
    <div class="home-metric">
      <strong>${value ?? '—'}</strong>
      <span>${label}</span>
    </div>
  `;
}

export function Inicio() {
  const [online, setOnline]   = useState(nexusOnline.value);
  const [stats, setStats]     = useState(null);
  const [health, setHealth]   = useState(null);
  const [version, setVersion] = useState('');

  useEffect(() => {
    startPing();
    const unsub = nexusOnline.subscribe(v => setOnline(v));

    pingAurora()
      .then(d => setVersion(d?.version || ''))
      .catch(() => {});

    cargarDashboardStats()
      .then(d => setStats(d))
      .catch(() => {});

    const refrescarHealth = () => cargarHealth().then(d => d && setHealth(d)).catch(() => {});
    refrescarHealth();
    const id = setInterval(refrescarHealth, 5000);

    return () => { stopPing(); unsub(); clearInterval(id); };
  }, []);

  useEffect(() => registerAIView({
    id: 'inicio',
    description: 'Portada operativa: salud del sistema, actividad agregada y accesos frecuentes.',
    actions: {
      status: { description: 'Devuelve salud y métricas visibles del sistema.', readOnly: true, run: () => ({ online, version, health, stats }) },
      quick_access: { description: 'Lista destinos frecuentes disponibles.', readOnly: true, run: () => QUICK_ACTIONS.map(({ tab, label, desc }) => ({ tab, label, description: desc })) },
      open: { description: 'Abre uno de los destinos frecuentes.', input: { tab: { type: 'string', required: true } }, run: ({ tab }) => { if (!QUICK_ACTIONS.some(item => item.tab === tab)) throw new Error(`Destino no frecuente: ${tab}`); setTab(tab); return { tab }; } },
    },
  }), [online, version, health, stats]);

  return html`
    <div class="home-deck">
      <header class="home-hero">
        <div class="home-brand-mark"><${Icon} name="aurora" size=${19} /><//>
        <div class="home-brand-copy">
          <div class="home-title-line">
            <h1>Aurora</h1>
            ${version && html`<span>v${version}</span>`}
          </div>
          <p>Herramientas, actividad y servicios en un solo punto.</p>
        </div>
        <${Status} tone=${online ? 'ok' : 'err'}>${online ? 'Operativa' : 'Sin conexión'}<//>
      </header>

      <section class="home-section">
        <div class="home-section-heading">
          <div><span>Sistema</span><small>Disponibilidad local</small></div>
          ${health && html`<strong>${[health.ok, health.pi?.ok, health.llama?.ok, health.db?.ok].filter(Boolean).length}/4 activos</strong>`}
        </div>
        <${Panel} class="home-system-panel">
          <${PanelBody} class="home-system-body">
            ${health ? html`
              <div class="home-health-grid">
                <${HealthNode} ok=${health.ok} icon="aurora" label="Aurora" detail=${`up ${formatUptime(health.uptime_s)}`} />
                <${HealthNode} ok=${health.pi?.ok} icon="brain" label="Lyria" detail=${health.pi?.ok ? 'Agente conectado' : 'Sin conexión'} />
                <${HealthNode} ok=${health.llama?.ok} icon="eye" label="OCR / Browser" detail=${health.llama?.ok ? `${health.llama.modelos} modelo(s)` : 'Puerto 8088 offline'} />
                <${HealthNode} ok=${health.db?.ok} icon="chart" label="Base de datos" detail=${formatBytes(health.db?.bytes)} />
              </div>
            ` : html`<div class="home-system-loading">Leyendo servicios…</div>`}

            ${stats && html`
              <div class="home-metrics" aria-label="Actividad de Aurora">
                <${Metric} label="Chats" value=${stats.chats_total} />
                <${Metric} label="Mensajes" value=${stats.mensajes_total} />
                <${Metric} label="Prompts" value=${stats.prompts_total} />
                <${Metric} label="Tokens" value=${stats.tokens_total} />
                <${Metric} label="Cloud" value=${stats.cloud_convs_total} />
              </div>
            `}
          <//>
        <//>
      </section>

      <section class="home-section">
        <div class="home-section-heading">
          <div><span>Herramientas frecuentes</span><small>Continúa sin buscar en el riel</small></div>
        </div>
        <div class="home-tool-grid">
          ${QUICK_ACTIONS.map(a => html`
            <${Button} key=${a.tab} class="home-tool" onClick=${() => setTab(a.tab)} title=${a.desc}>
              <span class="home-tool-icon"><${Icon} name=${a.icon} size=${18} /><//>
              <span class="home-tool-copy"><strong>${a.label}</strong><small>${a.desc}</small><//>
              <span class="home-tool-arrow"><${Icon} name="chevronRight" size=${13} /><//>
            <//>
          `)}
        </div>
      </section>

      <div class="home-footer-note">
        <${Icon} name="command" size=${13} />
        <span>El riel conserva las 18 herramientas; Inicio sólo muestra las que aceleran el regreso.</span>
      </div>
    </div>
  `;
}

export default Inicio;
