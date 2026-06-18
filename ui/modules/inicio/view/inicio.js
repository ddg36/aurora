const html = (...args) => globalThis.html(...args);
const { useState, useEffect } = globalThis.preactHooks;

import { nexusOnline, activeTab, setTab } from '../../../store.js';
import { startPing, stopPing } from '../scripts/ping.js';
import { pingAurora, cargarDashboardStats, cargarHealth, formatBytes, formatUptime } from '../scripts/dashboard.js';
import { QUICK_ACTIONS } from '../foot/actions.js';

function HealthChip({ ok, label, detail }) {
  return html`
    <div class=${'db-status-chip' + (ok ? ' online' : '')}>
      <span class="db-status-dot">${ok ? '●' : '○'}</span>
      <span class="db-status-name">${label}</span>
      <span class="db-status-sub">${detail}</span>
    </div>
  `;
}

function StatCard({ label, value }) {
  return html`
    <div class="stat-card">
      <span class="stat-value">${value ?? '—'}</span>
      <span class="stat-label">${label}</span>
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

  return html`
    <div class="lobby-view">

      <div class="lobby-header">
        <div>
          <h1>Aurora</h1>
          ${version && html`<span class="lobby-header-sub">v${version}</span>`}
        </div>
        <span class=${'lobby-online-dot ' + (online ? 'db-status-chip online' : 'db-status-chip')}>
          ${online ? '● online' : '○ offline'}
        </span>
      </div>

      ${health && html`
        <section class="lobby-section">
          <h2 class="section-title">Sistema</h2>
          <div class="db-status-row">
            <${HealthChip} ok=${health.ok} label="Aurora" detail=${`up ${formatUptime(health.uptime_s)}`} />
            <${HealthChip} ok=${health.llama?.ok} label="llama-server" detail=${health.llama?.ok ? `${health.llama.modelos} modelo(s)` : 'offline :8088'} />
            <${HealthChip} ok=${health.db?.ok} label="Base de datos" detail=${formatBytes(health.db?.bytes)} />
          </div>
        </section>
      `}

      ${stats && html`
        <section class="lobby-section">
          <h2 class="section-title">Estadísticas</h2>
          <div class="stats-grid">
            <${StatCard} label="Chats" value=${stats.chats_total} />
            <${StatCard} label="Prompts" value=${stats.prompts_total} />
            <${StatCard} label="Mensajes" value=${stats.mensajes_total} />
            <${StatCard} label="Tokens" value=${stats.tokens_total} />
            <${StatCard} label="Cloud convs" value=${stats.cloud_convs_total} />
            <${StatCard} label="Nav acciones" value=${stats.nav_acciones_total} />
          </div>
        </section>
      `}

      <section class="lobby-section">
        <h2 class="section-title">Acceso rápido</h2>
        <div class="quick-grid">
          ${QUICK_ACTIONS.map(a => html`
            <button
              key=${a.tab}
              class="quick-card"
              onClick=${() => setTab(a.tab)}
            >
              <span class="quick-icon">${a.icon}</span>
              <span class="quick-label">${a.label}</span>
              <span class="quick-desc">${a.desc}</span>
            </button>
          `)}
        </div>
      </section>

    </div>
  `;
}

export default Inicio;
